// backend/src/services/adaptiveLoopService.js
// The adaptive learning loop, run after every submitted assessment/quiz:
//
//   answers -> assessment evidence -> updated competency level
//           -> recalculated skill gaps -> refreshed recommendations
//           -> regenerated learning path
//
// It deliberately reuses the existing engines instead of adding a second
// scoring system:
//   mapUserCompetencies()       blends the profile estimate with ALL stored
//                               evidence (see competencyMappingService)
//   calculateAndStoreSkillGaps() / generateRecommendations() /
//   generateLearningPath()      the same functions the "Refresh" buttons use.
//
// What actually happened is persisted in quiz_attempts.adaptive_update_json,
// so the Result page can show truthful "what changed" information after a
// reload (nothing is claimed that did not run).

const { pool } = require('../config/db');
const { mapUserCompetencies } = require('./competencyMappingService');
const { calculateAndStoreSkillGaps } = require('./skillGapService');
const { generateRecommendations, getStoredRecommendations } = require('./recommendationService');
const { generateLearningPath, getLearningPath } = require('./learningPathService');
const { classifyPriority } = require('../config/skillGapConfig');
const { EVIDENCE_MIN_CONFIDENCE } = require('../config/documentMappingConfig');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function gapStatus(previousGap, newGap) {
  if (previousGap === null || newGap === null) return null;
  if (previousGap === 0 && newGap === 0) return 'Requirement met';
  if (newGap === 0) return 'Gap closed';
  if (newGap < previousGap) return 'Gap reduced';
  if (newGap > previousGap) return 'Gap increased';
  return 'Gap unchanged';
}

function topRecommendationView(rec) {
  if (!rec) return null;
  return {
    title: rec.resource.title,
    provider: rec.resource.provider,
    integrationMode: rec.resource.integrationMode,
    url: rec.resource.url || null,
    duration: rec.resource.duration || null,
    difficulty: rec.resource.difficulty,
    competencyId: rec.competencyId,
    competencyName: rec.competencyName,
  };
}

/** Questions of THIS attempt that legitimately count as evidence for a competency. */
function evidenceBuckets(quizType, questionRows, breakdown) {
  const byCompetency = new Map();
  for (const q of questionRows) {
    if (!q.competency_id) continue;
    const eligible = quizType === 'Diagnostic' || Number(q.mapping_confidence) >= EVIDENCE_MIN_CONFIDENCE;
    if (!eligible) continue;
    if (!byCompetency.has(q.competency_id)) byCompetency.set(q.competency_id, { correct: 0, total: 0 });
    const bucket = byCompetency.get(q.competency_id);
    bucket.total += 1;
    const graded = breakdown.find((b) => b.questionId === q.id);
    if (graded && graded.isCorrect) bucket.correct += 1;
  }
  return byCompetency;
}

async function saveAdaptiveUpdate(attemptId, payload) {
  await pool.query('UPDATE quiz_attempts SET adaptive_update_json = ? WHERE id = ?', [JSON.stringify(payload), attemptId]);
}

/**
 * Runs the loop for one submitted attempt. Never throws: a failure anywhere is
 * logged and reflected honestly in the returned/stored flags, and the attempt
 * itself (already stored by the caller) is unaffected.
 */
async function applyAttemptToAdaptiveLoop({ userId, quizAttemptId, quizType, questionRows, breakdown }) {
  const byCompetency = evidenceBuckets(quizType, questionRows, breakdown);

  if (byCompetency.size === 0) {
    console.log('[ADAPTIVE] This quiz has no competency-mapped questions — competency profile left unchanged.');
    const update = { applicable: false, updatedAt: new Date().toISOString() };
    await saveAdaptiveUpdate(quizAttemptId, update).catch(() => {});
    return { competencyImpact: [], adaptiveUpdate: update };
  }

  const update = {
    applicable: true,
    competencyUpdated: false,
    gapsRecalculated: false,
    recommendationsRefreshed: false,
    learningPathUpdated: false,
    unapplied: [],
    recommendationShift: {},
    updatedAt: new Date().toISOString(),
  };

  let competencyImpact = [];
  try {
    const competencyIds = [...byCompetency.keys()];
    const placeholders = competencyIds.map(() => '?').join(',');

    // ---- "before" snapshot (must be taken before any recalculation)
    const [beforeLevelRows] = await pool.query(
      `SELECT competency_id, current_level FROM user_competencies WHERE user_id = ? AND competency_id IN (${placeholders})`,
      [userId, ...competencyIds]
    );
    const beforeLevel = new Map(beforeLevelRows.map((r) => [r.competency_id, Number(r.current_level)]));
    const [beforeGapRows] = await pool.query(
      `SELECT competency_id, required_level FROM skill_gaps WHERE user_id = ? AND competency_id IN (${placeholders})`,
      [userId, ...competencyIds]
    );
    const requiredBefore = new Map(beforeGapRows.map((r) => [r.competency_id, Number(r.required_level)]));
    const recsBefore = await getStoredRecommendations(userId);
    const pathBefore = await getLearningPath(userId);

    // ---- 1. competency levels (profile estimate blended with stored evidence)
    const mappingResult = await mapUserCompetencies(userId);
    const afterByCompetency = new Map(mappingResult.mapped.map((m) => [m.competencyId, m]));
    update.competencyUpdated = mappingResult.mapped.length > 0;

    // audit trail + competencies that cannot be applied (no requirement for this designation)
    const [nameRows] = await pool.query(`SELECT id, name FROM competencies WHERE id IN (${placeholders})`, competencyIds);
    const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
    for (const [competencyId, stats] of byCompetency) {
      const after = afterByCompetency.get(competencyId);
      if (!after) {
        update.unapplied.push({
          competencyId,
          name: nameById.get(competencyId),
          reason: 'This competency has no requirement configured for your designation, so it is not part of your competency profile or skill-gap analysis.',
        });
        continue;
      }
      const previousLevel = beforeLevel.get(competencyId) ?? 0;
      const quizScore = round2((stats.correct / stats.total) * 100);
      await pool.query(
        `INSERT INTO competency_assessments (user_id, competency_id, quiz_attempt_id, score, previous_level, new_level)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, competencyId, quizAttemptId, quizScore, previousLevel, after.currentLevel]
      );
      console.log(`[ADAPTIVE] ${after.name}: ${previousLevel} → ${after.currentLevel} (this quiz: ${stats.correct}/${stats.total} = ${quizScore}%)`);
    }

    // ---- 2-4. gaps -> recommendations -> learning path (each reported separately)
    let gapResult = { gaps: [] };
    try {
      gapResult = await calculateAndStoreSkillGaps(userId);
      update.gapsRecalculated = true;
    } catch (err) {
      console.error('[ADAPTIVE] Skill-gap recalculation failed:', err.message);
    }
    if (update.gapsRecalculated) {
      try {
        await generateRecommendations(userId);
        update.recommendationsRefreshed = true;
      } catch (err) {
        console.error('[ADAPTIVE] Recommendation refresh failed:', err.message);
      }
    }
    if (update.recommendationsRefreshed) {
      try {
        await generateLearningPath(userId);
        update.learningPathUpdated = true;
      } catch (err) {
        console.error('[ADAPTIVE] Learning path update failed:', err.message);
      }
    }

    const recsAfter = update.recommendationsRefreshed ? await getStoredRecommendations(userId) : recsBefore;
    const pathAfter = update.learningPathUpdated ? await getLearningPath(userId) : pathBefore;
    const topFor = (recs, cid) => recs.find((r) => r.competencyId === cid && r.rank === 1) || recs.find((r) => r.competencyId === cid) || null;

    const afterGapByCompetency = new Map(gapResult.gaps.map((g) => [g.competencyId, g]));
    for (const competencyId of competencyIds) {
      const after = afterByCompetency.get(competencyId);
      if (!after) continue;
      const before = topFor(recsBefore, competencyId);
      const now = topFor(recsAfter, competencyId);
      update.recommendationShift[competencyId] = {
        before: before ? before.resource.title : null,
        after: now ? now.resource.title : null,
      };
    }
    update.pathSummary = {
      before: pathBefore ? { total: pathBefore.summary.total, completed: pathBefore.summary.completed } : null,
      after: pathAfter ? { total: pathAfter.summary.total, completed: pathAfter.summary.completed } : null,
    };

    competencyImpact = await buildStoredCompetencyImpact(userId, quizAttemptId, { update, afterGapByCompetency, requiredBefore });
  } catch (err) {
    console.error('[ADAPTIVE] Pipeline failed:', err.message);
  }

  await saveAdaptiveUpdate(quizAttemptId, update).catch((err) => console.error('[ADAPTIVE] Could not persist update summary:', err.message));
  return { competencyImpact, adaptiveUpdate: update };
}

/**
 * Rebuilds the per-competency before/after summary from persisted data only
 * (competency_assessments audit rows + the stored adaptive_update_json), so
 * the Result page survives a refresh and an OLD attempt keeps showing the
 * numbers as they stood right after THAT attempt.
 *
 * required_level is read from skill_gaps (role requirements do not change
 * during a session).
 */
async function buildStoredCompetencyImpact(userId, quizAttemptId, live = {}) {
  const [rows] = await pool.query(
    `SELECT ca.competency_id, ca.previous_level, ca.new_level, ca.score AS quiz_score,
            c.name AS competency_name, sg.required_level,
            (SELECT COUNT(*) FROM quiz_questions qq
               WHERE qq.quiz_id = qa.quiz_id AND qq.competency_id = ca.competency_id) AS evidence_questions,
            (SELECT AVG(qq.mapping_confidence) FROM quiz_questions qq
               WHERE qq.quiz_id = qa.quiz_id AND qq.competency_id = ca.competency_id) AS avg_mapping_confidence
     FROM competency_assessments ca
     JOIN quiz_attempts qa ON qa.id = ca.quiz_attempt_id
     JOIN competencies c ON c.id = ca.competency_id
     LEFT JOIN skill_gaps sg ON sg.user_id = ca.user_id AND sg.competency_id = ca.competency_id
     WHERE ca.quiz_attempt_id = ? AND ca.user_id = ?
     ORDER BY ca.id ASC`,
    [quizAttemptId, userId]
  );
  if (rows.length === 0) return [];

  let shift = live.update ? live.update.recommendationShift : null;
  if (!shift) {
    const [[attempt]] = await pool.query('SELECT adaptive_update_json FROM quiz_attempts WHERE id = ? AND user_id = ?', [quizAttemptId, userId]);
    const stored = attempt && attempt.adaptive_update_json;
    const parsed = typeof stored === 'string' ? safeParse(stored) : stored;
    shift = (parsed && parsed.recommendationShift) || {};
  }

  return rows.map((row) => {
    const requiredLevel = row.required_level !== null ? Number(row.required_level) : null;
    const previousLevel = Number(row.previous_level);
    const newLevel = Number(row.new_level);
    const previousGap = requiredLevel !== null ? Math.max(0, round2(requiredLevel - previousLevel)) : null;
    const newGap = requiredLevel !== null ? Math.max(0, round2(requiredLevel - newLevel)) : null;
    const s = shift[row.competency_id] || null;
    return {
      competencyId: row.competency_id,
      competencyName: row.competency_name,
      previousScore: previousLevel,
      newScore: newLevel,
      quizEvidence: Number(row.quiz_score),
      evidenceQuestions: Number(row.evidence_questions),
      mappingConfidence: row.avg_mapping_confidence !== null ? round2(Number(row.avg_mapping_confidence)) : null,
      requiredLevel,
      previousGap,
      newGap,
      gapStatus: gapStatus(previousGap, newGap),
      previousPriority: previousGap !== null ? classifyPriority(previousGap).priority : null,
      newPriority: newGap !== null ? classifyPriority(newGap).priority : null,
      previousRecommendation: s ? s.before : null,
      newRecommendation: s ? s.after : null,
    };
  });
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Live "what should I do next" for a result page: the current top recommendation, preferring the impacted competencies. */
async function getNextStep(userId, impactedCompetencyIds = []) {
  const recs = await getStoredRecommendations(userId);
  if (recs.length === 0) return null;
  const preferred = recs.find((r) => impactedCompetencyIds.includes(r.competencyId)) || recs[0];
  return topRecommendationView(preferred);
}

function parseAdaptiveUpdate(stored) {
  if (!stored) return null;
  return typeof stored === 'string' ? safeParse(stored) : stored;
}

module.exports = {
  applyAttemptToAdaptiveLoop,
  buildStoredCompetencyImpact,
  getNextStep,
  parseAdaptiveUpdate,
  gapStatus,
};
