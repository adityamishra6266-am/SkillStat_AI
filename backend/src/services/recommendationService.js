// backend/src/services/recommendationService.js
// Personalized Recommendation Engine.
// now fed by multiple providers (see below), unchanged in
// ranking logic.
//
// Builds directly on the skill gap analysis: for every
// competency where the user has an open gap (gap > 0), looks up
// candidate learning resources for that competency from the
// `learning_resources` table, ranks them, and stores the top few in
// `recommendations`.
//
// MOCK / DEVELOPMENT DATA NOTICE
// -------------------------------
// `learning_resources` is a local, clearly-labeled mock catalog. As
// of existing it holds THREE kinds of prototype data, distinguished by
// the `source` column: the original local catalog ('MOCK_INTEGRATION',
// see database/seeds/competency_seed.sql), and mock iGOT ('IGOT') /
// mock NSSTA ('NSSTA') resources synced at startup by
// providers/providerResolver.js from providers/igot/mockIgotProvider.js
// and providers/nssta/mockNsstaProvider.js. None of this is a live
// integration with iGOT Karmayogi, NSSTA, or TPAC — every row is
// `is_mock` = 1. Because all three sources land in the same table,
// `getCandidateResources` below (unchanged since the first version) already
// returns candidates from all of them — the provider layer only
// decides what's IN the table, never how it's ranked. Swapping a mock
// provider for a real live adapter later only touches
// providers/providerResolver.js; `rankResourcesForGap`, the
// controller, the routes, and the frontend all stay as they are.

const { pool } = require('../config/db');
const { getStoredSkillGaps, calculateAndStoreSkillGaps } = require('./skillGapService');
const { RANK_BY_PRIORITY } = require('../config/skillGapConfig');
const { DIFFICULTY_RANK, MAX_RESOURCES_PER_COMPETENCY, getPreferredDifficulty } = require('../config/recommendationConfig');
const { withProviderView } = require('../utils/providerResourceView');

/**
 * Best-effort parse of a free-text duration string ("4 hours",
 * "1.5 hours") into a number of hours, for tie-breaking (shorter
 * resources first). Unparseable/missing durations sort last.
 */
function parseDurationHours(duration) {
  if (!duration) return Number.POSITIVE_INFINITY;
  const match = String(duration).match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Ensures skill gaps exist for the user (computing them on the fly
 * on a first visit, same convention as the skill gap / mapping
 * controllers), then returns only the ones with an actual deficit —
 * a competency the user already meets needs no learning resource.
 */
async function getOpenGaps(userId) {
  let gaps = await getStoredSkillGaps(userId);
  if (gaps.length === 0) {
    const result = await calculateAndStoreSkillGaps(userId);
    gaps = result.gaps;
  }
  return gaps.filter((g) => g.gap > 0);
}

/**
 * MOCK / DEVELOPMENT DATA SOURCE.
 * Reads candidate resources for one competency from the local mock
 * catalog. This is the one place a future real iGOT/NSSTA lookup
 * would be substituted in — its return shape (an array of resource
 * rows) is all `rankResourcesForGap` depends on.
 */
async function getCandidateResources(competencyId) {
  const [rows] = await pool.query(
    `SELECT id, title, description, competency_id, topic, difficulty, learning_type,
            source, external_id, estimated_duration, url, prerequisites, is_mock
     FROM learning_resources
     WHERE competency_id = ?`,
    [competencyId]
  );
  return rows;
}

/**
 * Ranks candidate resources for one skill gap by how well their
 * difficulty matches the level appropriate to the user's current
 * competency (closest match first), then by shorter duration, then
 * alphabetically for a stable, deterministic order. Returns the top
 * MAX_RESOURCES_PER_COMPETENCY.
 */
function rankResourcesForGap(resources, currentLevel) {
  const preferredDifficulty = getPreferredDifficulty(currentLevel);
  const preferredRank = DIFFICULTY_RANK[preferredDifficulty] ?? 2;

  const ranked = [...resources].sort((a, b) => {
    const distA = Math.abs((DIFFICULTY_RANK[a.difficulty] ?? 2) - preferredRank);
    const distB = Math.abs((DIFFICULTY_RANK[b.difficulty] ?? 2) - preferredRank);
    if (distA !== distB) return distA - distB;

    const durA = parseDurationHours(a.estimated_duration);
    const durB = parseDurationHours(b.estimated_duration);
    if (durA !== durB) return durA - durB;

    return a.title.localeCompare(b.title);
  });

  return { top: ranked.slice(0, MAX_RESOURCES_PER_COMPETENCY), preferredDifficulty };
}

/**
 * Builds a plain-language explanation from real, stored numbers —
 * never hard-coded per-competency text. Every sentence is assembled
 * from the gap's actual required/current/gap/priority values and the
 * resource's actual difficulty/type.
 */
function buildReason({ gap, resource, preferredDifficulty }) {
  const base =
    `Recommended because your ${gap.name} competency is ${gap.currentLevel}%, ` +
    `while the required level is ${gap.requiredLevel}% ` +
    `(a ${gap.gap} point gap, classified ${gap.priority} priority).`;

  const difficultyNote =
    resource.difficulty === preferredDifficulty
      ? ` This ${resource.difficulty.toLowerCase()}-difficulty ${resource.learning_type.toLowerCase()} matches your current level.`
      : ` This ${resource.difficulty.toLowerCase()}-difficulty ${resource.learning_type.toLowerCase()} was the closest match available for ${gap.name} at your level.`;

  return base + difficultyNote;
}

function serializeResource(resource) {
  return withProviderView({
    id: resource.id,
    title: resource.title,
    description: resource.description,
    topic: resource.topic,
    difficulty: resource.difficulty,
    learningType: resource.learning_type,
    source: resource.source,
    externalId: resource.external_id,
    isMock: !!resource.is_mock,
    duration: resource.estimated_duration,
    url: resource.url,
    prerequisites: resource.prerequisites,
  });
}

/**
 * Main entry point: (re)computes recommendations for every open
 * skill gap, stores them in `recommendations`, and removes stale
 * rows (a resource that fell out of the top-N ranking, or a
 * competency that is no longer an open gap — e.g. the user improved
 * enough to close it). Returns the fresh, sorted list.
 */
async function generateRecommendations(userId) {
  const openGaps = await getOpenGaps(userId);

  if (openGaps.length === 0) {
    const gapsExistAtAll = (await getStoredSkillGaps(userId)).length > 0;
    return {
      recommendations: [],
      message: gapsExistAtAll
        ? 'No open skill gaps right now — your current level meets or exceeds the requirement for every mapped competency, so there is nothing to recommend.'
        : 'No skill gaps available yet. Complete your profile so competency mapping and skill gap analysis can run first.',
    };
  }

  const recommendations = [];
  const writtenKeys = new Set();

  for (const gap of openGaps) {
    const resources = await getCandidateResources(gap.competencyId);

    if (resources.length === 0) {
      // No candidate resources exist for this competency yet. This is
      // never fabricated into a fake recommendation — it's surfaced
      // separately and freshly on every read via
      // getGapsWithoutResources, the same way existing surfaces
      // "unmapped" competencies, so it doesn't get silently lost once
      // other real recommendations exist for this user.
      continue;
    }

    const { top, preferredDifficulty } = rankResourcesForGap(resources, gap.currentLevel);

    top.forEach((resource, index) => {
      const reason = buildReason({ gap, resource, preferredDifficulty });

      writtenKeys.add(`${gap.competencyId}:${resource.id}`);
      recommendations.push({
        competencyId: gap.competencyId,
        competencyName: gap.name,
        category: gap.category,
        currentLevel: gap.currentLevel,
        requiredLevel: gap.requiredLevel,
        gap: gap.gap,
        priority: gap.priority,
        priorityRank: RANK_BY_PRIORITY[gap.priority] ?? 0,
        rank: index + 1,
        resource: serializeResource(resource),
        reason,
        _resourceId: resource.id, // internal, stripped before returning to the controller
      });
    });
  }

  // Persist: upsert every recommendation we just computed...
  for (const rec of recommendations) {
    if (!rec._resourceId) continue; // "no resources available" placeholder rows aren't stored
    await pool.query(
      `INSERT INTO recommendations (user_id, competency_id, learning_resource_id, reason, priority, rank_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), priority = VALUES(priority), rank_order = VALUES(rank_order)`,
      [userId, rec.competencyId, rec._resourceId, rec.reason, rec.priority, rec.rank || 1]
    );
  }

  // ...then remove anything stored previously that isn't part of
  // this run (a stale resource ranking, or a gap that closed).
  const [existingRows] = await pool.query(
    'SELECT id, competency_id, learning_resource_id FROM recommendations WHERE user_id = ?',
    [userId]
  );
  const staleIds = existingRows
    .filter((row) => !writtenKeys.has(`${row.competency_id}:${row.learning_resource_id}`))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await pool.query(
      `DELETE FROM recommendations WHERE id IN (${staleIds.map(() => '?').join(',')})`,
      staleIds
    );
  }

  recommendations.forEach((r) => delete r._resourceId);
  recommendations.sort(
    (a, b) => b.priorityRank - a.priorityRank || b.gap - a.gap || (a.rank || 0) - (b.rank || 0)
  );

  return { recommendations, message: null };
}

/**
 * Fast read path: returns whatever is already stored, joined with
 * the resource details and the latest skill-gap snapshot (so the
 * displayed current/required/gap numbers stay live even between
 * recalculations), without writing anything.
 */
async function getStoredRecommendations(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.competency_id, r.reason, r.priority, r.rank_order, r.status, r.created_at,
            c.name AS competency_name, c.category,
            lr.id AS resource_id, lr.title, lr.description, lr.topic, lr.difficulty,
            lr.learning_type, lr.source, lr.external_id, lr.estimated_duration, lr.url, lr.prerequisites, lr.is_mock,
            sg.required_level, sg.current_level, sg.gap
     FROM recommendations r
     JOIN competencies c ON c.id = r.competency_id
     JOIN learning_resources lr ON lr.id = r.learning_resource_id
     LEFT JOIN skill_gaps sg ON sg.user_id = r.user_id AND sg.competency_id = r.competency_id
     WHERE r.user_id = ?
     ORDER BY r.rank_order ASC`,
    [userId]
  );

  const recommendations = rows.map((row) => ({
    id: row.id,
    competencyId: row.competency_id,
    competencyName: row.competency_name,
    category: row.category,
    currentLevel: row.current_level !== null ? Number(row.current_level) : null,
    requiredLevel: row.required_level !== null ? Number(row.required_level) : null,
    gap: row.gap !== null ? Number(row.gap) : null,
    priority: row.priority,
    priorityRank: RANK_BY_PRIORITY[row.priority] ?? 0,
    rank: row.rank_order,
    status: row.status,
    resource: serializeResource({
      id: row.resource_id,
      title: row.title,
      description: row.description,
      topic: row.topic,
      difficulty: row.difficulty,
      learning_type: row.learning_type,
      source: row.source,
      external_id: row.external_id,
      is_mock: row.is_mock,
      estimated_duration: row.estimated_duration,
      url: row.url,
      prerequisites: row.prerequisites,
    }),
    reason: row.reason,
    createdAt: row.created_at,
  }));

  recommendations.sort((a, b) => b.priorityRank - a.priorityRank || (b.gap || 0) - (a.gap || 0) || a.rank - b.rank);
  return recommendations;
}

/**
 * Diagnostic, read-only: open skill gaps (gap > 0) for which the mock
 * catalog currently has zero candidate resources. These can never be
 * persisted as a `recommendations` row (there is no resource to link
 * to — the column is NOT NULL by design), so unlike real
 * recommendations they must be recomputed on every read rather than
 * cached, or they would silently vanish once at least one other real
 * recommendation exists for the user. Mirrors
 * skillGapService.getUnmappedCompetencies's "never fabricate, always
 * explain" approach.
 */
async function getGapsWithoutResources(userId) {
  const gaps = (await getStoredSkillGaps(userId)).filter((g) => g.gap > 0);
  if (gaps.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT competency_id, COUNT(*) AS resource_count
     FROM learning_resources
     WHERE competency_id IN (${gaps.map(() => '?').join(',')})
     GROUP BY competency_id`,
    gaps.map((g) => g.competencyId)
  );
  const countByCompetency = new Map(rows.map((r) => [r.competency_id, r.resource_count]));

  return gaps
    .filter((g) => !countByCompetency.get(g.competencyId))
    .map((g) => ({
      competencyId: g.competencyId,
      competencyName: g.name,
      category: g.category,
      currentLevel: g.currentLevel,
      requiredLevel: g.requiredLevel,
      gap: g.gap,
      priority: g.priority,
      reason: `No learning resources are currently available for ${g.name} in the mock learning catalog. An admin can add some to learning_resources.`,
    }));
}

module.exports = {
  generateRecommendations,
  getStoredRecommendations,
  getGapsWithoutResources,
  // exported for targeted testing
  rankResourcesForGap,
  buildReason,
};
