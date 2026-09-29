// backend/src/services/learningPathService.js
// Personalized Learning Path.
//
// Converts the user's existing recommendations into ONE ordered,
// sequential path: higher-priority skill gaps first, larger gaps
// before smaller ones, and — within a competency — prerequisite
// resources before the resources that depend on them. Progress is
// tracked directly on each path item and survives regeneration.
//
// MOCK / DEVELOPMENT DATA NOTICE
// -------------------------------
// Learning resources still come from the local mock catalog (see
// recommendationService.js). This module only sequences and tracks
// progress against whatever `generateRecommendations` already
// selected — it does not talk to any external course platform.

const { pool } = require('../config/db');
const { getStoredRecommendations, generateRecommendations } = require('./recommendationService');
const { withProviderView } = require('../utils/providerResourceView');

const PATH_TITLE = 'My Personalized Learning Path';

/**
 * Finds the user's single Active learning path, creating one if this
 * is their first visit. We deliberately keep one Active path per
 * user (rather than a new row every regeneration) so item-level
 * progress has something stable to attach to.
 */
async function ensureActiveLearningPath(userId) {
  const [existing] = await pool.query(
    "SELECT id FROM learning_paths WHERE user_id = ? AND status = 'Active' LIMIT 1",
    [userId]
  );
  if (existing.length > 0) return existing[0].id;

  const [result] = await pool.query('INSERT INTO learning_paths (user_id, title, status) VALUES (?, ?, ?)', [
    userId,
    PATH_TITLE,
    'Active',
  ]);
  return result.insertId;
}

/**
 * Ensures fresh recommendations exist (same on-first-visit convention
 * as the recommendation controller), then groups the flat
 * recommendation rows by competency, preserving the priority/gap
 * ordering `getStoredRecommendations` already sorts them in.
 */
async function getRecommendationGroups(userId) {
  let recommendations = await getStoredRecommendations(userId);
  if (recommendations.length === 0) {
    const result = await generateRecommendations(userId);
    recommendations = result.recommendations;
  }

  const groups = [];
  const byCompetency = new Map();
  for (const rec of recommendations) {
    if (!rec.resource) continue; // "no resource available" rows carry nothing to sequence
    if (!byCompetency.has(rec.competencyId)) {
      const group = {
        competencyId: rec.competencyId,
        competencyName: rec.competencyName,
        category: rec.category,
        currentLevel: rec.currentLevel,
        requiredLevel: rec.requiredLevel,
        gap: rec.gap,
        priority: rec.priority,
        items: [],
      };
      byCompetency.set(rec.competencyId, group);
      groups.push(group);
    }
    byCompetency.get(rec.competencyId).items.push(rec);
  }
  return groups;
}

/**
 * Orders one competency's recommended resources so a resource never
 * comes before its prerequisite. Prerequisites are matched by title
 * (see the `learning_resources.prerequisites` free-text field)
 * against the OTHER resources already recommended for this same
 * competency. This is a small, deterministic topological sort — no
 * LLM involved, per the phase requirement to keep the logic
 * explainable.
 *
 * Falls back to the existing rank order (already difficulty-ordered
 * by the recommendation engine) for resources with no prerequisite
 * relationship to resolve, and breaks any cycle defensively (a
 * misconfigured prerequisite loop must never hang the sequencer).
 */
function sequenceGroupByPrerequisite(items) {
  const byTitle = new Map(items.map((it) => [it.resource.title, it]));
  const depthCache = new Map();

  function depthOf(item, guard = new Set()) {
    const title = item.resource.title;
    if (depthCache.has(title)) return depthCache.get(title);
    if (guard.has(title)) return 0; // cycle guard — never hang
    guard.add(title);

    const prereqTitle = item.resource.prerequisites;
    const prereqItem = prereqTitle ? byTitle.get(prereqTitle) : null;
    const depth = prereqItem ? 1 + depthOf(prereqItem, guard) : 0;
    depthCache.set(title, depth);
    return depth;
  }

  return [...items].sort((a, b) => {
    const depthDiff = depthOf(a) - depthOf(b);
    if (depthDiff !== 0) return depthDiff;
    return (a.rank || 0) - (b.rank || 0); // stable fallback: original recommendation rank
  });
}

function buildStepReason({ group, positionInGroup, unmetPrerequisiteTitle }) {
  const base = `Sequenced for ${group.competencyName} (${group.priority} priority, ${group.gap}-point gap).`;
  if (unmetPrerequisiteTitle) {
    return `${base} Comes after its prerequisite, "${unmetPrerequisiteTitle}".`;
  }
  if (positionInGroup === 0) {
    return `${base} First recommended step for this competency.`;
  }
  return `${base} Step ${positionInGroup + 1} for this competency.`;
}

/**
 * Main entry point: (re)builds the user's single Active learning
 * path from their current recommendations. Safe to call repeatedly —
 * existing items are updated in place (sequence position, priority,
 * reason) WITHOUT touching their status/progress/started_at/
 * completed_at, so re-running this never erases progress. Items that
 * are no longer relevant (the gap closed, or the resource fell out
 * of the recommendation ranking) are removed ONLY if the user hadn't
 * started them; anything already In Progress or Completed is left in
 * place as a historical record.
 */
async function generateLearningPath(userId) {
  const groups = await getRecommendationGroups(userId);
  const pathId = await ensureActiveLearningPath(userId);

  if (groups.length === 0) {
    return { pathId, message: 'No open skill gaps with recommended resources yet — nothing to sequence.' };
  }

  // Flatten: competency groups are already priority/gap ordered by
  // getStoredRecommendations; within each group, prerequisite-order
  // the resources; then number every item 1..N across the whole path.
  const flattened = [];
  for (const group of groups) {
    const ordered = sequenceGroupByPrerequisite(group.items);
    ordered.forEach((item, positionInGroup) => {
      const prereqTitle = item.resource.prerequisites;
      const prereqInGroup = prereqTitle && ordered.some((o) => o.resource.title === prereqTitle);
      flattened.push({
        group,
        item,
        positionInGroup,
        unmetPrerequisiteTitle: prereqInGroup ? prereqTitle : null,
      });
    });
  }

  const writtenKeys = new Set();

  for (let i = 0; i < flattened.length; i++) {
    const { group, item, positionInGroup, unmetPrerequisiteTitle } = flattened[i];
    const sequenceOrder = i + 1;
    const key = `${group.competencyId}:${item.resource.id}`;
    writtenKeys.add(key);

    // A brand-new item starts Locked if it has an in-path prerequisite
    // that isn't Completed yet, otherwise Available. An item that
    // ALREADY EXISTS keeps whatever status/progress it has — this
    // INSERT ... ON DUPLICATE KEY UPDATE intentionally excludes those
    // columns.
    let initialStatus = 'Available';
    if (unmetPrerequisiteTitle) {
      const [prereqRows] = await pool.query(
        `SELECT lpi.status FROM learning_path_items lpi
         JOIN learning_resources lr ON lr.id = lpi.learning_resource_id
         WHERE lpi.learning_path_id = ? AND lr.title = ?`,
        [pathId, unmetPrerequisiteTitle]
      );
      const prereqStatus = prereqRows[0]?.status;
      initialStatus = prereqStatus === 'Completed' ? 'Available' : 'Locked';
    }

    const reason = buildStepReason({ group, positionInGroup, unmetPrerequisiteTitle });

    await pool.query(
      `INSERT INTO learning_path_items
         (learning_path_id, competency_id, priority, learning_resource_id, item_type, sequence_order, status, reason)
       VALUES (?, ?, ?, ?, 'Resource', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         priority = VALUES(priority),
         sequence_order = VALUES(sequence_order),
         reason = VALUES(reason)`,
      [pathId, group.competencyId, group.priority, item.resource.id, sequenceOrder, initialStatus, reason]
    );
  }

  // Re-run the unlock pass: a prerequisite may already be Completed
  // from a previous run (e.g. the path was regenerated after the
  // user finished the prerequisite step).
  await runUnlockPass(pathId);

  // Remove stale items — but only ones the user never touched.
  const [existingRows] = await pool.query(
    `SELECT lpi.id, lpi.competency_id, lpi.learning_resource_id, lpi.status
     FROM learning_path_items lpi
     WHERE lpi.learning_path_id = ? AND lpi.item_type = 'Resource'`,
    [pathId]
  );
  const staleIds = existingRows
    .filter((row) => {
      const key = `${row.competency_id}:${row.learning_resource_id}`;
      const untouched = row.status === 'Locked' || row.status === 'Available';
      return !writtenKeys.has(key) && untouched;
    })
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await pool.query(`DELETE FROM learning_path_items WHERE id IN (${staleIds.map(() => '?').join(',')})`, staleIds);
  }

  await pool.query('UPDATE learning_paths SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [pathId]);

  return { pathId, message: null };
}

/**
 * Flips any 'Locked' item whose prerequisite (matched by resource
 * title, within the same path) is 'Completed' over to 'Available'.
 * Called after generation and after every completion, so dependent
 * steps unlock immediately rather than waiting for the next
 * regeneration.
 */
async function runUnlockPass(pathId) {
  const [rows] = await pool.query(
    `SELECT lpi.id, lpi.status, lr.prerequisites
     FROM learning_path_items lpi
     JOIN learning_resources lr ON lr.id = lpi.learning_resource_id
     WHERE lpi.learning_path_id = ? AND lpi.status = 'Locked' AND lr.prerequisites IS NOT NULL`,
    [pathId]
  );
  if (rows.length === 0) return;

  for (const row of rows) {
    const [prereqRows] = await pool.query(
      `SELECT lpi.status FROM learning_path_items lpi
       JOIN learning_resources lr ON lr.id = lpi.learning_resource_id
       WHERE lpi.learning_path_id = ? AND lr.title = ?`,
      [pathId, row.prerequisites]
    );
    const prereqStatus = prereqRows[0]?.status;
    // No matching prerequisite item in this path (it wasn't
    // recommended, or was removed) — don't leave the dependent step
    // permanently Locked with nothing to satisfy it.
    const satisfied = !prereqRows[0] || prereqStatus === 'Completed';
    if (satisfied) {
      await pool.query("UPDATE learning_path_items SET status = 'Available' WHERE id = ?", [row.id]);
    }
  }
}

/**
 * Read path: the ordered list of items with resource/competency
 * details and a live current/required/gap snapshot from skill_gaps,
 * plus an overall summary for the page header / future dashboard use.
 */
async function getLearningPath(userId) {
  const [pathRows] = await pool.query(
    "SELECT id, title, status, updated_at FROM learning_paths WHERE user_id = ? AND status = 'Active' LIMIT 1",
    [userId]
  );
  if (pathRows.length === 0) return null;
  const path = pathRows[0];

  const [rows] = await pool.query(
    `SELECT lpi.id, lpi.competency_id, lpi.priority, lpi.sequence_order, lpi.status, lpi.progress_percentage,
            lpi.started_at, lpi.last_accessed_at, lpi.completed_at, lpi.reason,
            c.name AS competency_name, c.category,
            lr.id AS resource_id, lr.title, lr.description, lr.topic, lr.difficulty, lr.learning_type,
            lr.source, lr.external_id, lr.estimated_duration, lr.url, lr.prerequisites, lr.is_mock,
            sg.required_level, sg.current_level, sg.gap
     FROM learning_path_items lpi
     JOIN competencies c ON c.id = lpi.competency_id
     LEFT JOIN learning_resources lr ON lr.id = lpi.learning_resource_id
     LEFT JOIN skill_gaps sg ON sg.user_id = ? AND sg.competency_id = lpi.competency_id
     WHERE lpi.learning_path_id = ?
     ORDER BY lpi.sequence_order ASC`,
    [userId, path.id]
  );

  const items = rows.map((row) => ({
    id: row.id,
    competencyId: row.competency_id,
    competencyName: row.competency_name,
    category: row.category,
    priority: row.priority,
    sequence: row.sequence_order,
    status: row.status,
    progressPercentage: Number(row.progress_percentage),
    startedAt: row.started_at,
    lastAccessedAt: row.last_accessed_at,
    completedAt: row.completed_at,
    reason: row.reason,
    currentLevel: row.current_level !== null ? Number(row.current_level) : null,
    requiredLevel: row.required_level !== null ? Number(row.required_level) : null,
    gap: row.gap !== null ? Number(row.gap) : null,
    resource: withProviderView({
      id: row.resource_id,
      title: row.title,
      description: row.description,
      topic: row.topic,
      difficulty: row.difficulty,
      learningType: row.learning_type,
      source: row.source,
      externalId: row.external_id,
      isMock: !!row.is_mock,
      duration: row.estimated_duration,
      url: row.url,
      prerequisites: row.prerequisites,
    }),
  }));

  const summary = {
    total: items.length,
    notStarted: items.filter((i) => i.status === 'Available').length,
    locked: items.filter((i) => i.status === 'Locked').length,
    inProgress: items.filter((i) => i.status === 'In Progress').length,
    completed: items.filter((i) => i.status === 'Completed').length,
    overallProgress:
      items.length === 0
        ? 0
        : Math.round((items.reduce((sum, i) => sum + i.progressPercentage, 0) / items.length) * 100) / 100,
  };

  return { pathId: path.id, title: path.title, updatedAt: path.updated_at, items, summary };
}

/**
 * Starts a resource: only allowed from 'Available' (a 'Locked' item's
 * prerequisite isn't done yet; a 'Completed' item is already done).
 * Sets started_at the first time only, always bumps last_accessed_at.
 */
async function startItem(userId, itemId) {
  const item = await getOwnedItem(userId, itemId);
  if (!item) return { error: 'not_found' };
  if (item.status === 'Locked') return { error: 'locked' };
  if (item.status === 'Completed') return { error: 'already_completed' };

  await pool.query(
    `UPDATE learning_path_items
     SET status = 'In Progress',
         started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
         last_accessed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [itemId]
  );
  return { ok: true };
}

/**
 * Updates progress percentage (0-100) on an item already started.
 * Deliberately does NOT auto-complete at 100 — marking complete is a
 * distinct, explicit action (see completeItem), matching the
 * project's specified Start -> Update Progress -> Complete flow.
 */
async function updateItemProgress(userId, itemId, progressPercentage) {
  const item = await getOwnedItem(userId, itemId);
  if (!item) return { error: 'not_found' };
  if (item.status === 'Locked') return { error: 'locked' };
  if (item.status === 'Completed') return { error: 'already_completed' };

  const clamped = Math.max(0, Math.min(100, Number(progressPercentage)));
  await pool.query(
    `UPDATE learning_path_items
     SET status = 'In Progress',
         progress_percentage = ?,
         started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
         last_accessed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [clamped, itemId]
  );
  return { ok: true };
}

/**
 * Marks a resource completed. Not allowed while Locked (its
 * prerequisite must be completed first). After completing, runs the
 * unlock pass so any dependent step immediately becomes Available.
 */
async function completeItem(userId, itemId) {
  const item = await getOwnedItem(userId, itemId);
  if (!item) return { error: 'not_found' };
  if (item.status === 'Locked') return { error: 'locked' };
  if (item.status === 'Completed') return { error: 'already_completed' };

  await pool.query(
    `UPDATE learning_path_items
     SET status = 'Completed',
         progress_percentage = 100.00,
         started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
         completed_at = CURRENT_TIMESTAMP,
         last_accessed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [itemId]
  );
  await runUnlockPass(item.learning_path_id);
  return { ok: true };
}

/** Ownership check: an item belongs to the caller only if it sits in one of THEIR learning_paths rows. */
async function getOwnedItem(userId, itemId) {
  const [rows] = await pool.query(
    `SELECT lpi.id, lpi.status, lpi.learning_path_id
     FROM learning_path_items lpi
     JOIN learning_paths lp ON lp.id = lpi.learning_path_id
     WHERE lpi.id = ? AND lp.user_id = ?`,
    [itemId, userId]
  );
  return rows[0] || null;
}

module.exports = {
  generateLearningPath,
  getLearningPath,
  startItem,
  updateItemProgress,
  completeItem,
  // exported for targeted testing
  sequenceGroupByPrerequisite,
};
