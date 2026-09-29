// backend/src/controllers/diagnosticController.js
// exposes the diagnostic assessment service over HTTP,
// scoped to the authenticated user (same convention as the rest of
// the app: no :id in the URL, req.user.id from the JWT).

const {
  getEligibility,
  startDiagnosticAssessment,
  getDiagnosticHistory,
} = require('../services/diagnosticAssessmentService');

// GET /api/diagnostic/status
// Tells the frontend whether the "Start Diagnostic Assessment" action
// should be enabled, and why not if it isn't — so the UI can show a
// specific message ("complete your profile" / "contact an admin")
// instead of a generic error (the existing design, Error Handling).
async function getStatus(req, res) {
  try {
    const eligibility = await getEligibility(req.user.id);
    return res.json({ success: true, ...eligibility });
  } catch (err) {
    console.error('[Diagnostic GetStatus Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error checking diagnostic assessment eligibility.' });
  }
}

// POST /api/diagnostic/start
// Creates a new diagnostic quiz + questions and hands back its id.
// The frontend then uses the EXISTING GET /api/quiz/:id and
// POST /api/quiz/:id/submit endpoints — no separate diagnostic
// question/submission API is needed, since those endpoints already
// work generically on any competency-tagged quiz.
async function start(req, res) {
  try {
    const result = await startDiagnosticAssessment(req.user.id);
    if (result.error) {
      const status = result.error === 'NO_QUESTIONS' ? 422 : 400;
      return res.status(status).json({ success: false, reason: result.error, message: result.message });
    }
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('[Diagnostic Start Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error starting the diagnostic assessment.' });
  }
}

// GET /api/diagnostic/history
async function history(req, res) {
  try {
    const attempts = await getDiagnosticHistory(req.user.id);
    return res.json({ success: true, attempts });
  } catch (err) {
    console.error('[Diagnostic History Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching diagnostic assessment history.' });
  }
}

module.exports = { getStatus, start, history };
