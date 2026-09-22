// backend/src/controllers/dashboardController.js

const { pool } = require('../config/db');
const { calculateCompletion } = require('./profileController');

async function getDashboard(req, res) {
  try {
    const userId = req.user.id;

    const [userRows] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [userId]);
    const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [userId]);
    const profile = profileRows[0] || {};
    const completion = calculateCompletion(profile);

    const [[docCountRow]] = await pool.query('SELECT COUNT(*) AS count FROM documents WHERE user_id = ?', [userId]);
    const [[attemptCountRow]] = await pool.query('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = ?', [userId]);
    const [[avgRow]] = await pool.query(
      'SELECT AVG(percentage) AS avg_score FROM quiz_attempts WHERE user_id = ?',
      [userId]
    );

    const [latestAttemptRows] = await pool.query(
      `SELECT qa.score, qa.total_questions, qa.percentage, qa.attempted_at, q.title AS quiz_title
       FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.user_id = ? ORDER BY qa.attempted_at DESC LIMIT 1`,
      [userId]
    );

    const [latestDocRows] = await pool.query(
      `SELECT id, original_filename, file_type, uploaded_at
       FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 1`,
      [userId]
    );

    let latestTopic = null;
    let latestQuizId = null;
    if (latestDocRows.length > 0) {
      const [quizForDoc] = await pool.query(
        'SELECT id, title FROM quizzes WHERE document_id = ? ORDER BY created_at DESC LIMIT 1',
        [latestDocRows[0].id]
      );
      if (quizForDoc.length > 0) {
        latestTopic = quizForDoc[0].title.replace(/^Quiz:\s*/, '').replace(/^Quiz on\s*/, '');
        latestQuizId = quizForDoc[0].id;
      }
    }

    const [recentResults] = await pool.query(
      `SELECT qa.id, qa.score, qa.total_questions, qa.percentage, qa.attempted_at,
              q.title AS quiz_title
       FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.user_id = ? ORDER BY qa.attempted_at DESC LIMIT 5`,
      [userId]
    );

    return res.json({
      success: true,
      dashboard: {
        user: userRows[0],
        profileCompletion: completion,
        stats: {
          documentsUploaded: docCountRow.count,
          quizzesAttempted: attemptCountRow.count,
          averageScore: avgRow.avg_score ? Number(Number(avgRow.avg_score).toFixed(2)) : 0,
          latestScore: latestAttemptRows.length ? Number(latestAttemptRows[0].percentage) : 0,
        },
        currentLearningArea: {
          documentName: latestDocRows[0]?.original_filename || null,
          topic: latestTopic,
          skillLevel: profile.skill_level || 'Beginner',
          latestQuizId,
        },
        recentResults,
      },
    });
  } catch (err) {
    console.error('[GetDashboard Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching dashboard data.' });
  }
}

module.exports = { getDashboard };
