// backend/src/controllers/resultController.js

const { pool } = require('../config/db');
const { performanceLabel } = require('./quizController');
const { buildStoredCompetencyImpact, getNextStep, parseAdaptiveUpdate } = require('../services/adaptiveLoopService');
const { getQuizProvenance } = require('../services/quizProvenanceService');

async function listResults(req, res) {
  try {
    // LEFT JOIN documents — a diagnostic assessment has no
    // source document, so document_name is simply null for those rows
    // rather than the whole result being excluded by an INNER JOIN.
    const [rows] = await pool.query(
      `SELECT qa.id, qa.score, qa.total_questions, qa.percentage, qa.attempted_at,
              q.title AS quiz_title, q.quiz_type, q.generation_mode, d.original_filename AS document_name
       FROM quiz_attempts qa
       JOIN quizzes q ON qa.quiz_id = q.id
       LEFT JOIN documents d ON q.document_id = d.id
       WHERE qa.user_id = ?
       ORDER BY qa.attempted_at DESC`,
      [req.user.id]
    );

    const stats = {
      totalAttempts: rows.length,
      averageScore: rows.length ? Number((rows.reduce((s, r) => s + Number(r.percentage), 0) / rows.length).toFixed(2)) : 0,
      highestScore: rows.length ? Math.max(...rows.map((r) => Number(r.percentage))) : 0,
      latestScore: rows.length ? Number(rows[0].percentage) : 0,
    };

    return res.json({ success: true, results: rows, stats });
  } catch (err) {
    console.error('[ListResults Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching results.' });
  }
}

async function getResult(req, res) {
  try {
    const attemptId = Number(req.params.id);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid result id.' });
    }
    // Ownership is part of the query: another user's result is simply "not found".
    const [attemptRows] = await pool.query(
      `SELECT qa.*, q.title AS quiz_title, q.document_id, q.quiz_type
       FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.id = ? AND qa.user_id = ?`,
      [attemptId, req.user.id]
    );
    if (attemptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Result not found.' });
    }
    const attempt = attemptRows[0];

    const [questionRows] = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, explanation
       FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC`,
      [attempt.quiz_id]
    );

    const answers = typeof attempt.answers_json === 'string' ? JSON.parse(attempt.answers_json) : attempt.answers_json;

    const breakdown = questionRows.map((q) => ({
      questionId: q.id,
      question: q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      userAnswer: answers ? Number(answers[q.id]) : null,
      correctAnswer: q.correct_answer,
      isCorrect: answers ? Number(answers[q.id]) === q.correct_answer : false,
      explanation: q.explanation,
    }));

    const competencyImpact = await buildStoredCompetencyImpact(req.user.id, attempt.id);
    const adaptiveUpdate = parseAdaptiveUpdate(attempt.adaptive_update_json);
    const provenance = await getQuizProvenance(attempt.quiz_id);
    const nextStep =
      adaptiveUpdate && adaptiveUpdate.applicable
        ? await getNextStep(req.user.id, competencyImpact.map((c) => c.competencyId))
        : null;

    return res.json({
      success: true,
      result: {
        id: attempt.id,
        quizId: attempt.quiz_id,
        quizTitle: attempt.quiz_title,
        // 'Diagnostic' | 'Standard'
        assessmentType: attempt.quiz_type,
        score: attempt.score,
        total: attempt.total_questions,
        percentage: Number(attempt.percentage),
        performance: performanceLabel(Number(attempt.percentage)),
        attemptedAt: attempt.attempted_at,
        breakdown,
        competencyImpact,
        // null for attempts made before the adaptive summary was recorded
        adaptiveUpdate,
        provenance,
        nextStep,
      },
    });
  } catch (err) {
    console.error('[GetResult Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching result.' });
  }
}

module.exports = { listResults, getResult };
