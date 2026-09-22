// backend/src/controllers/quizController.js

const { pool } = require('../config/db');

function performanceLabel(percentage) {
  if (percentage >= 90) return 'Excellent understanding';
  if (percentage >= 70) return 'Good understanding';
  if (percentage >= 50) return 'Needs more practice';
  return 'Needs improvement';
}

async function getQuiz(req, res) {
  try {
    const [quizRows] = await pool.query(
      `SELECT q.id, q.title, q.document_id, d.original_filename
       FROM quizzes q JOIN documents d ON q.document_id = d.id
       WHERE q.id = ? AND q.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const [questionRows] = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d
       FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC`,
      [req.params.id]
    );

    const questions = questionRows.map((q) => ({
      id: q.id,
      question: q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
    }));

    return res.json({ success: true, quiz: { ...quizRows[0], questions } });
  } catch (err) {
    console.error('[GetQuiz Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching quiz.' });
  }
}

async function submitQuiz(req, res) {
  try {
    const quizId = req.params.id;
    const { answers } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, message: 'Answers are required to submit the quiz.' });
    }

    const [quizRows] = await pool.query('SELECT id FROM quizzes WHERE id = ? AND user_id = ?', [quizId, req.user.id]);
    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const [questionRows] = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, explanation
       FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC`,
      [quizId]
    );

    if (questionRows.length === 0) {
      return res.status(422).json({ success: false, message: 'This quiz has no questions.' });
    }

    const unanswered = questionRows.filter((q) => answers[q.id] === undefined || answers[q.id] === null);
    if (unanswered.length > 0) {
      return res.status(400).json({ success: false, message: 'Please answer all questions before submitting.' });
    }

    let score = 0;
    const breakdown = questionRows.map((q) => {
      const userAnswer = Number(answers[q.id]);
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

    await pool.query(
      `INSERT INTO quiz_attempts (user_id, quiz_id, score, total_questions, percentage, answers_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, quizId, score, total, percentage, JSON.stringify(answers)]
    );

    return res.json({
      success: true,
      result: {
        score,
        total,
        percentage,
        performance: performanceLabel(percentage),
        breakdown,
      },
    });
  } catch (err) {
    console.error('[SubmitQuiz Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error submitting quiz.' });
  }
}

module.exports = { getQuiz, submitQuiz, performanceLabel };
