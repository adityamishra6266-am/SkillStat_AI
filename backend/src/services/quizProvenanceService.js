// backend/src/services/quizProvenanceService.js
// Reads back HOW a quiz was produced and HOW its questions map to the
// competency framework, straight from the database, so the UI can describe
// it truthfully (curated bank vs AI-generated vs extractive; mapped vs not
// mapped) on the quiz page, the result page and after a page reload.

const { pool } = require('../config/db');
const { EVIDENCE_MIN_CONFIDENCE } = require('../config/documentMappingConfig');

const MODE_LABELS = {
  curated_bank: 'Curated competency bank',
  ai_assisted: 'AI-assisted (curated bank + LLM-generated questions)',
  document_llm: 'LLM-generated from your document',
  document_extractive: 'Built from your document text (no LLM)',
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function getQuizProvenance(quizId) {
  const [[quiz]] = await pool.query('SELECT id, quiz_type, generation_mode FROM quizzes WHERE id = ?', [quizId]);
  if (!quiz) return null;

  const [questions] = await pool.query(
    `SELECT qq.id, qq.competency_id, qq.source_type, qq.mapping_confidence, qq.mapping_method, qq.mapping_reason,
            c.name AS competency_name
     FROM quiz_questions qq
     LEFT JOIN competencies c ON c.id = qq.competency_id
     WHERE qq.quiz_id = ?`,
    [quizId]
  );

  const sourceCounts = { bank: 0, llm: 0, extractive: 0, unknown: 0 };
  for (const q of questions) sourceCounts[q.source_type || 'unknown'] += 1;

  // Legacy rows (created before source tracking) fall back to the quiz type.
  const generationMode =
    quiz.generation_mode || (quiz.quiz_type === 'Diagnostic' ? 'curated_bank' : 'document_extractive');
  const modeIsRecorded = !!quiz.generation_mode;

  const isDiagnostic = quiz.quiz_type === 'Diagnostic';
  const mappedQuestions = questions.filter(
    (q) => q.competency_id && (isDiagnostic || Number(q.mapping_confidence) >= EVIDENCE_MIN_CONFIDENCE)
  );

  const byCompetency = new Map();
  for (const q of mappedQuestions) {
    if (!byCompetency.has(q.competency_id)) {
      byCompetency.set(q.competency_id, {
        competencyId: q.competency_id,
        name: q.competency_name,
        questionCount: 0,
        confidenceSum: 0,
        method: q.mapping_method,
        reason: q.mapping_reason,
      });
    }
    const entry = byCompetency.get(q.competency_id);
    entry.questionCount += 1;
    entry.confidenceSum += q.mapping_confidence !== null ? Number(q.mapping_confidence) : 1;
  }

  return {
    quizType: quiz.quiz_type,
    generationMode,
    generationModeLabel: MODE_LABELS[generationMode] || generationMode,
    modeIsRecorded,
    sourceCounts,
    mapping: {
      totalQuestions: questions.length,
      mappedQuestions: mappedQuestions.length,
      competencies: [...byCompetency.values()].map((e) => ({
        competencyId: e.competencyId,
        name: e.name,
        questionCount: e.questionCount,
        avgConfidence: round2(e.confidenceSum / e.questionCount),
        method: e.method,
        reason: e.reason,
      })),
    },
  };
}

module.exports = { getQuizProvenance, MODE_LABELS };
