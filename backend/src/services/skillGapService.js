// backend/src/services/skillGapService.js
// Skill Gap Analysis.
//
// Builds directly on top of the existing competency mapping service:
// for every competency the user has been mapped to that also has a
// requirement for their designation, computes
//
//     gap = max(0, requiredLevel - currentLevel)
//
// classifies it into a priority tier (see skillGapConfig.js), and
// stores the result in the `skill_gaps` table created earlier
// (no schema changes needed for this phase).
//
// Competencies the user has been mapped to but which have NO
// requirement configured for their designation are never given a
// fabricated requirement — they are reported separately as
// `unmapped`, per the project's explicit "do not invent standards"
// rule.

const { pool } = require('../config/db');
const { getStoredMapping, mapUserCompetencies } = require('./competencyMappingService');
const { PRIORITY_THRESHOLDS, RANK_BY_PRIORITY, classifyPriority } = require('../config/skillGapConfig');

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Human-readable explanation of one gap row, built fresh at read time
 * (not stored) so it always reflects the current threshold config.
 */
function buildExplanation({ competencyName, requiredLevel, currentLevel, gap, priority, confidence }) {
  const thresholdsText = PRIORITY_THRESHOLDS.map((t) => `${t.priority} \u2265 ${t.minGap}`).join(', ');

  if (gap === 0) {
    return (
      `Your current level (${currentLevel}%) already meets or exceeds the required level ` +
      `(${requiredLevel}%) for ${competencyName}. No gap — classified as ${priority}.`
    );
  }

  return (
    `Required level for your role is ${requiredLevel}%. Your current mapped level is ${currentLevel}%` +
    `${confidence ? ` (${confidence} confidence)` : ''}. ` +
    `Gap = ${requiredLevel} − ${currentLevel} = ${gap} points, classified as ${priority} ` +
    `(thresholds: ${thresholdsText}).`
  );
}

/**
 * Ensures a competency mapping exists for the user, computing
 * one on the fly if this is their first visit, same convention as
 * competencyMappingController.getMyMapping.
 */
async function ensureMapping(userId) {
  const stored = await getStoredMapping(userId);
  if (stored.mapped.length > 0) {
    return { mapped: stored.mapped, profile: stored.profile, mappingMessage: null };
  }
  const result = await mapUserCompetencies(userId);
  return { mapped: result.mapped, profile: stored.profile, mappingMessage: result.message };
}

/**
 * (Re)computes skill gaps for every one of the user's mapped
 * competencies that has a requirement for their designation, stores
 * them in `skill_gaps`, and removes any stale gap rows left over from
 * a previous designation/requirement set. Returns the fresh results
 * plus the list of mapped competencies that could NOT be given a gap
 * (no requirement configured — never fabricated).
 */
async function calculateAndStoreSkillGaps(userId) {
  const { mapped, profile, mappingMessage } = await ensureMapping(userId);

  if (mapped.length === 0) {
    return { gaps: [], unmapped: [], message: mappingMessage || 'No competency mapping available yet.' };
  }

  const withRequirement = mapped.filter((m) => m.requiredLevel !== null && m.requiredLevel !== undefined);
  const unmapped = mapped
    .filter((m) => m.requiredLevel === null || m.requiredLevel === undefined)
    .map((m) => ({
      competencyId: m.competencyId,
      code: m.code,
      name: m.name,
      currentLevel: m.currentLevel,
      reason:
        `No competency requirement is configured for designation '${profile?.designation || 'your role'}' ` +
        `for this competency. A skill gap is not calculated here rather than inventing a requirement — ` +
        `an admin can add one to the competency framework.`,
    }));

  const gaps = [];
  const writtenCompetencyIds = [];

  for (const item of withRequirement) {
    const requiredLevel = Number(item.requiredLevel);
    const currentLevel = Number(item.currentLevel);
    const gap = round2(Math.max(0, requiredLevel - currentLevel));
    const tier = classifyPriority(gap);

    await pool.query(
      `INSERT INTO skill_gaps (user_id, competency_id, required_level, current_level, gap, priority)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         required_level = VALUES(required_level),
         current_level = VALUES(current_level),
         gap = VALUES(gap),
         priority = VALUES(priority)`,
      [userId, item.competencyId, requiredLevel, currentLevel, gap, tier.priority]
    );

    writtenCompetencyIds.push(item.competencyId);

    gaps.push({
      competencyId: item.competencyId,
      code: item.code,
      name: item.name,
      category: item.category,
      requiredLevel,
      currentLevel,
      gap,
      priority: tier.priority,
      priorityRank: tier.rank,
      explanation: buildExplanation({
        competencyName: item.name,
        requiredLevel,
        currentLevel,
        gap,
        priority: tier.priority,
        confidence: item.confidence,
      }),
    });
  }

  // Drop stale gap rows (e.g. left over from a previous designation)
  // that no longer correspond to a currently-applicable requirement.
  if (writtenCompetencyIds.length > 0) {
    await pool.query(
      `DELETE FROM skill_gaps WHERE user_id = ? AND competency_id NOT IN (${writtenCompetencyIds.map(() => '?').join(',')})`,
      [userId, ...writtenCompetencyIds]
    );
  } else {
    await pool.query('DELETE FROM skill_gaps WHERE user_id = ?', [userId]);
  }

  gaps.sort((a, b) => b.priorityRank - a.priorityRank || b.gap - a.gap);

  return { gaps, unmapped, message: null };
}

/**
 * Fast read path: returns whatever is already stored in `skill_gaps`
 * without recomputing anything, joined with competency name/category
 * and (if available) the confidence behind the current_level snapshot.
 */
async function getStoredSkillGaps(userId) {
  const [rows] = await pool.query(
    `SELECT sg.competency_id, sg.required_level, sg.current_level, sg.gap, sg.priority, sg.calculated_at,
            c.code, c.name, c.category,
            uc.confidence
     FROM skill_gaps sg
     JOIN competencies c ON c.id = sg.competency_id
     LEFT JOIN user_competencies uc ON uc.user_id = sg.user_id AND uc.competency_id = sg.competency_id
     WHERE sg.user_id = ?`,
    [userId]
  );

  const gaps = rows.map((row) => {
    const requiredLevel = Number(row.required_level);
    const currentLevel = Number(row.current_level);
    const gap = Number(row.gap);
    return {
      competencyId: row.competency_id,
      code: row.code,
      name: row.name,
      category: row.category,
      requiredLevel,
      currentLevel,
      gap,
      priority: row.priority,
      priorityRank: RANK_BY_PRIORITY[row.priority] ?? 0,
      explanation: buildExplanation({
        competencyName: row.name,
        requiredLevel,
        currentLevel,
        gap,
        priority: row.priority,
        confidence: row.confidence,
      }),
      calculatedAt: row.calculated_at,
    };
  });

  gaps.sort((a, b) => b.priorityRank - a.priorityRank || b.gap - a.gap);
  return gaps;
}

/**
 * Competencies the user is mapped to that currently have no stored
 * gap row (i.e. no requirement was found for them at last
 * calculation). Purely structural — does not recompute anything.
 */
async function getUnmappedCompetencies(userId) {
  const [rows] = await pool.query(
    `SELECT uc.competency_id, uc.current_level, c.code, c.name
     FROM user_competencies uc
     JOIN competencies c ON c.id = uc.competency_id
     LEFT JOIN skill_gaps sg ON sg.user_id = uc.user_id AND sg.competency_id = uc.competency_id
     WHERE uc.user_id = ? AND sg.id IS NULL`,
    [userId]
  );

  return rows.map((row) => ({
    competencyId: row.competency_id,
    code: row.code,
    name: row.name,
    currentLevel: Number(row.current_level),
    reason:
      'No competency requirement is configured for your role for this competency, so a skill gap ' +
      'cannot be calculated without inventing a requirement.',
  }));
}

/**
 * Small aggregate used by the dashboard/API: counts per priority tier
 * and the single highest-priority gap (already sorted, so it's just
 * the first element).
 */
function buildSummary(gaps) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const g of gaps) {
    counts[g.priority] = (counts[g.priority] || 0) + 1;
  }
  return {
    counts,
    totalGaps: gaps.length,
    topGap: gaps.length > 0 ? gaps[0] : null,
  };
}

module.exports = {
  calculateAndStoreSkillGaps,
  getStoredSkillGaps,
  getUnmappedCompetencies,
  buildSummary,
};
