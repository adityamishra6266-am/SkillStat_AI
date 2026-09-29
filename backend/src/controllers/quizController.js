// backend/src/controllers/quizController.js
// Serves a quiz and scores a submission. The adaptive loop that follows a
// submission lives in services/adaptiveLoopService.js.

const { pool } = require('../config/db');
const { applyAttemptToAdaptiveLoop, getNextStep } = require('../services/adaptiveLoopService');
const { getQuizProvenance } = require('../services/quizProvenanceService');

function performanceLabel(percentage) {
  if (percentage >= 90) return 'Excellent understanding';
  if (percentage >= 70) return 'Good understanding';
  if (percentage >= 50) return 'Needs more practice';
  return 'Needs improvement';
}

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getQuiz(req, res) {
  try {
    const quizId = parseId(req.params.id);
    if (!quizId) return res.status(400).json({ success: false, message: 'Invalid quiz id.' });

    // Ownership is part of the query: another user's quiz is simply "not found".
    // LEFT JOIN - a diagnostic assessment has no source document.
    const [quizRows] = await pool.query(
      `SELECT q.id, q.title, q.document_id, q.quiz_type, d.original_filename
       FROM quizzes q LEFT JOIN documents d ON q.document_id = d.id
       WHERE q.id = ? AND q.user_id = ?`,
      [quizId, req.user.id]
    );
    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const [questionRows] = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d
       FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC`,
      [quizId]
    );

    const questions = questionRows.map((q) => ({
      id: q.id,
      question: q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
    }));

    const provenance = await getQuizProvenance(quizId);
    return res.json({ success: true, quiz: { ...quizRows[0], questions, provenance } });
  } catch (err) {
    console.error('[GetQuiz Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching quiz.' });
  }
}

async function submitQuiz(req, res) {
  try {
    const quizId = parseId(req.params.id);
    if (!quizId) return res.status(400).json({ success: false, message: 'Invalid quiz id.' });

    const { answers } = req.body || {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'Answers are required to submit the quiz.' });
    }

    const [quizRows] = await pool.query('SELECT id, quiz_type FROM quizzes WHERE id = ? AND user_id = ?', [quizId, req.user.id]);
    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const [questionRows] = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, explanation,
              competency_id, mapping_confidence
       FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC`,
      [quizId]
    );
    if (questionRows.length === 0) {
      return res.status(422).json({ success: false, message: 'This quiz has no questions.' });
    }

    // Only answers to THIS quiz's questions are accepted, and each must be an option index 0-3.
    const cleanAnswers = {};
    for (const q of questionRows) {
      const raw = answers[q.id];
      if (raw === undefined || raw === null || raw === '') {
        return res.status(400).json({ success: false, message: 'Please answer all questions before submitting.' });
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 3) {
        return res.status(400).json({ success: false, message: 'One or more answers are invalid.' });
      }
      cleanAnswers[q.id] = n;
    }

    let score = 0;
    const breakdown = questionRows.map((q) => {
      const userAnswer = cleanAnswers[q.id];
      const isCorrect = userAnswer === q.correct_answer;
      if (isCorrect) score += 1;
      return {
        questionId: q.id,
        question: q.question,
        options: [q.option_a, q.option_b, q.option_c, q.option_d],
        userAnswer,
        correctAnswer: q.correct_answer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const total = questionRows.length;
    const percentage = Number(((score / total) * 100).toFixed(2));
    console.log(`[QUIZ] Quiz ${quizId} submitted by user ${req.user.id}: ${score}/${total} (${percentage}%)`);

    const [attemptResult] = await pool.query(
      `INSERT INTO quiz_attempts (user_id, quiz_id, score, total_questions, percentage, answers_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, quizId, score, total, percentage, JSON.stringify(cleanAnswers)]
    );
    const attemptId = attemptResult.insertId;

    // The attempt is safely stored above; the adaptive loop never throws and
    // reports exactly which steps ran.
    const { competencyImpact, adaptiveUpdate } = await applyAttemptToAdaptiveLoop({
      userId: req.user.id,
      quizAttemptId: attemptId,
      quizType: quizRows[0].quiz_type,
      questionRows,
      breakdown,
    });

    const provenance = await getQuizProvenance(quizId);
    const nextStep = adaptiveUpdate.applicable
      ? await getNextStep(req.user.id, competencyImpact.map((c) => c.competencyId))
      : null;

    return res.json({
      success: true,
      result: {
        id: attemptId,
        score,
        total,
        percentage,
        performance: performanceLabel(percentage),
        assessmentType: quizRows[0].quiz_type,
        breakdown,
        competencyImpact,
        adaptiveUpdate,
        provenance,
        nextStep,
      },
    });
  } catch (err) {
    console.error('[SubmitQuiz Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error submitting quiz.' });
  }
}

module.exports = { getQuiz, submitQuiz, performanceLabel };
