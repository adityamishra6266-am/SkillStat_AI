// backend/src/services/diagnosticAssessmentService.js
// AI-assisted diagnostic competency assessment.
//
// This service ONLY builds and stores a diagnostic assessment (a
// specific kind of `quizzes` row — see migration 006). It deliberately
// does NOT contain any competency-scoring, skill-gap, or
// recommendation logic: once the user submits their answers, the
// EXISTING quizController.submitQuiz -> applyQuizToCompetencies
// pipeline takes over unchanged, because it already works
// generically on any quiz_id whose questions carry a competency_id.
// That reuse is the whole point of the "do not build a second
// competency-update algorithm" rule.
//
// Question sourcing, in priority order:
//   1. The hand-authored `diagnostic_questions` bank (reliable,
//      deterministic — see database/seeds/diagnostic_questions_seed.sql).
//   2. If the bank has too few questions for an applicable competency,
//      a best-effort call to the AI service asks an LLM to fill the
//      gap (see aiService.generateDiagnosticQuestions). This is
//      OPTIONAL and silently skipped if no LLM is configured there —
//      never presented as more than it is.

const { pool } = require('../config/db');
const { findApplicableRequirements } = require('./competencyMappingService');
const { generateDiagnosticQuestions, getAiServiceStatus } = require('./aiService');
const { validateQuestionSet } = require('../utils/questionValidation');
const {
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  MAX_QUESTIONS_PER_COMPETENCY,
  MAX_COMPETENCIES_COVERED,
} = require('../config/diagnosticAssessmentConfig');

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Estimated completion time shown on the intro screen — a simple,
 * honest ~45 seconds/question estimate rounded to a friendly range,
 * not a fabricated fixed number regardless of assessment length.
 */
function estimateMinutes(questionCount) {
  const minMinutes = Math.max(3, Math.round((questionCount * 30) / 60));
  const maxMinutes = Math.max(minMinutes + 2, Math.round((questionCount * 75) / 60));
  return { min: minMinutes, max: maxMinutes };
}

/**
 * GET-safe read: can this user start a diagnostic assessment right
 * now, and if not, exactly why (surfaced to the frontend so it can
 * show the right guidance rather than a generic error — see DiagnosticAssessment.jsx
 * brief section 22, "Error Handling").
 */
async function getEligibility(userId) {
  const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [userId]);
  const profile = profileRows[0];

  if (!profile || !profile.designation || !profile.designation.trim()) {
    return {
      canStart: false,
      reason: 'NO_DESIGNATION',
      message: 'Your designation is required before starting the diagnostic assessment.',
    };
  }

  const requirements = await findApplicableRequirements(profile);
  if (requirements.length === 0) {
    return {
      canStart: false,
      reason: 'NO_REQUIREMENTS',
      message: `No competency requirements are currently configured for designation '${profile.designation}'. Please contact the administrator.`,
    };
  }

  const competencyIds = requirements.map((r) => r.competency_id);
  const [bankRows] = await pool.query(
    `SELECT competency_id, COUNT(*) AS count
     FROM diagnostic_questions
     WHERE is_active = 1 AND competency_id IN (${competencyIds.map(() => '?').join(',')})
     GROUP BY competency_id`,
    competencyIds
  );
  const totalBankQuestions = bankRows.reduce((sum, r) => sum + r.count, 0);

  if (totalBankQuestions === 0) {
    return {
      canStart: false,
      reason: 'NO_QUESTION_BANK',
      message:
        `No diagnostic questions are currently configured for the competencies relevant to '${profile.designation}'. ` +
        `Please contact the administrator.`,
    };
  }

  // Whether the user has ANY real assessment evidence yet (as opposed
  // to a profile-only estimate) — reused to drive the dashboard's
  // "not fully assessed yet" prompt without inventing a second signal.
  const [evidenceRows] = await pool.query(
    "SELECT COUNT(*) AS count FROM user_competencies WHERE user_id = ? AND source LIKE '%quiz%'",
    [userId]
  );
  const hasEvidence = evidenceRows[0].count > 0;

  const [priorRows] = await pool.query(
    "SELECT COUNT(*) AS count FROM quizzes WHERE user_id = ? AND quiz_type = 'Diagnostic'",
    [userId]
  );

  const coveredCompetencies = requirements
    .slice()
    .sort((a, b) => Number(b.weight) - Number(a.weight))
    .slice(0, MAX_COMPETENCIES_COVERED)
    .map((r) => r.name);

  const questionCountEstimate = Math.min(
    MAX_QUESTIONS,
    Math.max(MIN_QUESTIONS, Math.min(totalBankQuestions, coveredCompetencies.length * MAX_QUESTIONS_PER_COMPETENCY))
  );

  // Honest description of how the assessment will be produced. The curated
  // bank is ALWAYS the primary source; an LLM is only used to top up
  // competencies the bank cannot cover, so "AI-assisted" is claimed only when
  // that can actually happen (LLM configured AND a competency has no bank questions).
  const aiStatus = await getAiServiceStatus();
  const coveredIds = new Set(bankRows.map((r) => r.competency_id));
  const bankGapExists = requirements.some((r) => !coveredIds.has(r.competency_id));
  const assessmentMode = aiStatus.llmConfigured && bankGapExists ? 'ai_assisted' : 'curated_bank';

  return {
    canStart: true,
    reason: null,
    message: null,
    assessmentMode,
    assessmentModeLabel:
      assessmentMode === 'ai_assisted'
        ? 'AI-assisted (curated competency bank, topped up with LLM-generated questions where the bank has gaps)'
        : 'Curated competency bank',
    llmConfigured: aiStatus.llmConfigured,
    designation: profile.designation,
    relevantCompetencies: coveredCompetencies,
    hasEvidence,
    hasTakenBefore: priorRows[0].count > 0,
    estimatedMinutes: estimateMinutes(questionCountEstimate),
    estimatedQuestionCount: questionCountEstimate,
  };
}

/**
 * Draws up to MAX_QUESTIONS_PER_COMPETENCY random active questions
 * from the bank for one competency. ORDER BY RAND() is a deliberate,
 * simple way to vary a retake without building real adaptive/CAT
 * logic (explicitly out of scope for this phase).
 */
async function drawBankQuestions(competencyId, limit, excludeIds) {
  if (limit <= 0) return [];
  const excludeClause = excludeIds && excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
  const [rows] = await pool.query(
    `SELECT id, competency_id, question, option_a, option_b, option_c, option_d, correct_answer, difficulty, explanation
     FROM diagnostic_questions
     WHERE competency_id = ? AND is_active = 1 ${excludeClause}
     ORDER BY RAND()
     LIMIT ?`,
    excludeIds && excludeIds.length > 0 ? [competencyId, ...excludeIds, limit] : [competencyId, limit]
  );
  return rows.map((r) => ({
    competencyId: r.competency_id,
    question: r.question,
    options: [r.option_a, r.option_b, r.option_c, r.option_d],
    correctAnswer: r.correct_answer,
    difficulty: r.difficulty,
    explanation: r.explanation,
    source: 'bank',
  }));
}

/**
 * Builds the final question set for a diagnostic assessment: the
 * bank first (prioritizing the user's most heavily-weighted
 * applicable competencies), then an optional AI gap-fill pass if
 * still short of MIN_QUESTIONS, then a final shuffle.
 *
 * Never fabricates coverage for a competency that genuinely has no
 * questions available (bank or AI) — it is simply left out, same
 * "never invent, always explain" convention as the rest of the app.
 */
async function buildQuestionSet(requirements, skillLevel) {
  const prioritized = requirements
    .slice()
    .sort((a, b) => Number(b.weight) - Number(a.weight))
    .slice(0, MAX_COMPETENCIES_COVERED);

  let selected = [];
  const selectedBankIdsByCompetency = new Map();

  // Pass 1: up to MAX_QUESTIONS_PER_COMPETENCY per competency.
  for (const req of prioritized) {
    const rows = await drawBankQuestions(req.competency_id, MAX_QUESTIONS_PER_COMPETENCY, []);
    selected.push(...rows);
  }

  // Pass 2 (top-up): if we're still short of MIN_QUESTIONS, ask each
  // competency for one more question it hasn't already contributed.
  if (selected.length < MIN_QUESTIONS) {
    for (const req of prioritized) {
      if (selected.length >= MIN_QUESTIONS) break;
      const alreadyUsed = selected.filter((q) => q.competencyId === req.competency_id).length;
      if (alreadyUsed === 0) continue; // this competency's bank was already empty
      const excludeIds = []; // we don't track raw ids post-mapping; a fresh random draw with a higher limit covers it
      const rows = await drawBankQuestions(req.competency_id, alreadyUsed + 1, excludeIds);
      // Replace this competency's contribution with the larger draw (dedup by question text).
      selected = selected.filter((q) => q.competencyId !== req.competency_id);
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row.question)) continue;
        seen.add(row.question);
        selected.push(row);
      }
    }
  }

  let usedAI = false;

  // Pass 3 (AI gap-fill): still short — try the AI service once for
  // the competencies that contributed nothing at all. Best-effort;
  // silently skipped if unavailable/not configured (see aiService.js).
  if (selected.length < MIN_QUESTIONS) {
    const emptyCompetencies = prioritized.filter(
      (req) => !selected.some((q) => q.competencyId === req.competency_id)
    );
    if (emptyCompetencies.length > 0) {
      const gaps = emptyCompetencies.map((req) => ({
        competencyCode: req.code,
        competencyName: req.name,
        description: req.description || '',
        difficulty: 'Medium',
        count: 1,
      }));
      const aiResult = await generateDiagnosticQuestions(gaps, skillLevel);
      for (const result of aiResult.results || []) {
        const req = emptyCompetencies.find((r) => r.code === result.competencyCode);
        if (!req || !result.questions || result.questions.length === 0) continue;
        const check = validateQuestionSet(result.questions);
        if (!check.ok) {
          console.log(`[DIAGNOSTIC] Discarded invalid AI-generated questions for ${req.code}: ${check.reason}`);
          continue;
        }
        for (const q of check.questions) {
          selected.push({
            competencyId: req.competency_id,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            difficulty: 'Medium',
            explanation: q.explanation,
            source: 'ai',
          });
          usedAI = true;
        }
      }
    }
  }

  selected = shuffle(selected).slice(0, MAX_QUESTIONS);

  return { questions: selected, usedAI };
}

/**
 * Main entry point: creates a new diagnostic `quizzes` row and its
 * `quiz_questions`, ready for the EXISTING GET /api/quiz/:id and
 * POST /api/quiz/:id/submit endpoints to take over unchanged.
 */
async function startDiagnosticAssessment(userId) {
  const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [userId]);
  const profile = profileRows[0];

  if (!profile || !profile.designation || !profile.designation.trim()) {
    return { error: 'NO_DESIGNATION', message: 'Your designation is required before starting the diagnostic assessment.' };
  }

  const requirements = await findApplicableRequirements(profile);
  if (requirements.length === 0) {
    return {
      error: 'NO_REQUIREMENTS',
      message: `No competency requirements are currently configured for designation '${profile.designation}'. Please contact the administrator.`,
    };
  }

  const { questions, usedAI } = await buildQuestionSet(requirements, profile.skill_level);
  if (questions.length === 0) {
    return {
      error: 'NO_QUESTIONS',
      message: 'No diagnostic questions are currently available for your role. Please contact the administrator.',
    };
  }

  const competencyById = new Map(requirements.map((r) => [r.competency_id, r]));
  const assessmentMode = questions.some((q) => q.source === 'ai') ? 'ai_assisted' : 'curated_bank';
  const dateLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const title = `Diagnostic Assessment - ${dateLabel}`;

  const [quizResult] = await pool.query(
    "INSERT INTO quizzes (user_id, document_id, quiz_type, generation_mode, title) VALUES (?, NULL, 'Diagnostic', ?, ?)",
    [userId, assessmentMode, title]
  );
  const quizId = quizResult.insertId;

  for (const q of questions) {
    const competency = competencyById.get(q.competencyId);
    await pool.query(
      `INSERT INTO quiz_questions
         (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation, competency_id, topic, difficulty,
          source_type, mapping_confidence, mapping_method, mapping_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.00, ?, ?)`,
      [
        quizId,
        q.question,
        q.options[0],
        q.options[1],
        q.options[2],
        q.options[3],
        q.correctAnswer,
        q.explanation,
        q.competencyId,
        competency ? competency.name : null,
        q.difficulty,
        q.source === 'ai' ? 'llm' : 'bank',
        q.source === 'ai' ? 'llm' : 'curated',
        q.source === 'ai' ? 'Generated by the configured LLM for this competency.' : 'Curated bank question authored for this competency.',
      ]
    );
  }

  const competencyNames = [...new Set(questions.map((q) => competencyById.get(q.competencyId)?.name).filter(Boolean))];

  console.log(
    `[DIAGNOSTIC] Started assessment ${quizId} for user ${userId}: ${questions.length} question(s) across ` +
      `${competencyNames.length} competency(ies)${usedAI ? ' (AI gap-fill used)' : ''}.`
  );

  return {
    quizId,
    questionCount: questions.length,
    competencies: competencyNames,
    usedAI,
    assessmentMode,
  };
}

/**
 * Read-only history of this user's past diagnostic assessments (as
 * opposed to document-based quizzes), for the "take another
 * diagnostic assessment later" flow (the existing design section 14).
 */
async function getDiagnosticHistory(userId) {
  const [rows] = await pool.query(
    `SELECT qa.id, qa.score, qa.total_questions, qa.percentage, qa.attempted_at, q.title
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     WHERE q.user_id = ? AND q.quiz_type = 'Diagnostic'
     ORDER BY qa.attempted_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    attemptId: r.id,
    title: r.title,
    score: r.score,
    total: r.total_questions,
    percentage: Number(r.percentage),
    attemptedAt: r.attempted_at,
  }));
}

module.exports = {
  getEligibility,
  startDiagnosticAssessment,
  getDiagnosticHistory,
  // exported for targeted testing
  buildQuestionSet,
};
