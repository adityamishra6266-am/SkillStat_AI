// backend/src/controllers/dashboardController.js
//
// the main learner dashboard. This was already the one
// consolidated `GET /api/dashboard` endpoint the project had (Phase
// 1-era), so per the phase's own rule ("reuse it, don't duplicate
// dashboard logic") it's EXTENDED here rather than replaced or
// duplicated into a second endpoint.
//
// Every competency/skill-gap/recommendation/learning-path number
// below is read straight from the SAME stored-read functions Phases
// 2-5 already expose to their own pages (getStoredMapping,
// getStoredSkillGaps, getStoredRecommendations, getLearningPath), and
// the "recent assessment" impact reuses the own
// buildStoredCompetencyImpact. No new scoring/priority/ranking logic
// is introduced here — this endpoint only aggregates.
//
// Deliberately READ-ONLY (no mapUserCompetencies/calculateAndStore.../
// generate... calls): loading the dashboard should never have a write
// side effect. A brand-new user who hasn't completed their profile or
// taken a quiz yet will see the explicit empty states the frontend
// renders for each section (see Dashboard.jsx) rather than the page
// silently computing data on their behalf.

const { pool } = require('../config/db');
const { calculateCompletion } = require('./profileController');
const { getStoredMapping } = require('../services/competencyMappingService');
const { getStoredSkillGaps, buildSummary } = require('../services/skillGapService');
const { getStoredRecommendations } = require('../services/recommendationService');
const { getLearningPath } = require('../services/learningPathService');
const { buildStoredCompetencyImpact } = require('../services/adaptiveLoopService');

function round2(n) {
  return Math.round(n * 100) / 100;
}

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
      `SELECT qa.id, qa.score, qa.total_questions, qa.percentage, qa.attempted_at, q.title AS quiz_title, q.quiz_type
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
              q.title AS quiz_title, q.quiz_type
       FROM quiz_attempts qa JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.user_id = ? ORDER BY qa.attempted_at DESC LIMIT 5`,
      [userId]
    );

    // has this user ever backed a competency with real quiz
    // evidence (as opposed to the profile-only estimate every user
    // gets as soon as they save a designation — see
    // competencyMappingService.mapUserCompetencies)? This is the
    // honest signal for "not fully assessed yet", since a profile-only
    // mapping already gives non-null numbers on the dashboard.
    const [evidenceRows] = await pool.query(
      "SELECT COUNT(*) AS count FROM user_competencies WHERE user_id = ? AND source LIKE '%quiz%'",
      [userId]
    );
    const needsDiagnostic = !!profile.designation && evidenceRows[0].count === 0;

    // --- existing additions below: pure reads of the already-
    // stored data, no recomputation triggered from the dashboard.

    const { mapped: competencies } = await getStoredMapping(userId);
    const skillGaps = await getStoredSkillGaps(userId);
    const skillGapSummary = buildSummary(skillGaps);
    const recommendations = await getStoredRecommendations(userId);
    const learningPath = await getLearningPath(userId); // null if none generated yet

    const overallCompetency =
      competencies.length > 0
        ? round2(competencies.reduce((sum, c) => sum + c.currentLevel, 0) / competencies.length)
        : null;

    let recentAssessment = null;
    if (latestAttemptRows.length > 0) {
      const latest = latestAttemptRows[0];
      recentAssessment = {
        id: latest.id,
        quizTitle: latest.quiz_title,
        score: latest.score,
        total: latest.total_questions,
        percentage: Number(latest.percentage),
        attemptedAt: latest.attempted_at,
        // Same audit trail existing writes at quiz-submit time — this is
        // what makes "competency changed after this quiz" show up on
        // the dashboard automatically, with no dashboard-specific logic.
        competencyImpact: await buildStoredCompetencyImpact(userId, latest.id),
      };
    }

    return res.json({
      success: true,
      dashboard: {
        user: userRows[0],
        profile: {
          designation: profile.designation || null,
          department: profile.department || null,
        },
        profileCompletion: completion, // kept for backward compatibility
        // drives the "Start Diagnostic Assessment" prompt.
        needsDiagnostic,
        stats: {
          documentsUploaded: docCountRow.count,
          quizzesAttempted: attemptCountRow.count,
          averageScore: avgRow.avg_score ? Number(Number(avgRow.avg_score).toFixed(2)) : 0,
          latestScore: latestAttemptRows.length ? Number(latestAttemptRows[0].percentage) : 0,
          // existing overview cards — every value below is null/0 rather
          // than fabricated when the user has no data yet; the
          // frontend renders the appropriate empty state for that.
          overallCompetency,
          criticalGaps: skillGapSummary.counts.Critical,
          learningProgress: learningPath ? learningPath.summary.overallProgress : null,
          assessmentsCompleted: attemptCountRow.count,
        },
        competencies, // full mapped list: currentLevel, requiredLevel, confidence, etc.
        skillGaps: skillGaps.slice(0, 3), // top 3 — already priority/gap sorted
        skillGapSummary,
        topRecommendation: recommendations.length > 0 ? recommendations[0] : null,
        learningPath: learningPath
          ? { summary: learningPath.summary, items: learningPath.items.slice(0, 5) }
          : null,
        recentAssessment,
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
