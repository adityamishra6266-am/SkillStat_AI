// backend/src/controllers/competencyMappingController.js
// exposes the competency mapping service over HTTP, scoped
// to the authenticated user (same convention as profileController /
// dashboardController: no :id in the URL, req.user.id from the JWT).

const { mapUserCompetencies, getStoredMapping } = require('../services/competencyMappingService');
const { calculateAndStoreSkillGaps } = require('../services/skillGapService');
const { generateRecommendations } = require('../services/recommendationService');
const { generateLearningPath } = require('../services/learningPathService');

// GET /api/competencies/mapping
// Returns the user's stored mapping. If they have none yet (first
// visit), computes and stores it on the fly so the page always shows
// something meaningful without requiring a separate "generate" click.
async function getMyMapping(req, res) {
  try {
    let { mapped, profile } = await getStoredMapping(req.user.id);

    if (mapped.length === 0) {
      const result = await mapUserCompetencies(req.user.id);
      if (result.mapped.length === 0) {
        return res.json({ success: true, mapped: [], message: result.message });
      }
      mapped = result.mapped;
    }

    return res.json({ success: true, mapped, profileDesignation: profile?.designation || null });
  } catch (err) {
    console.error('[GetMyMapping Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching competency mapping.' });
  }
}

// POST /api/competencies/mapping
// Explicitly (re)computes the mapping — e.g. a "Refresh" button after
// the user edits their profile or takes a new quiz.
async function refreshMyMapping(req, res) {
  try {
    const result = await mapUserCompetencies(req.user.id);
    if (result.mapped.length === 0) {
      return res.status(422).json({ success: false, message: result.message });
    }
    // keep skill gaps in sync whenever the mapping is
    // explicitly refreshed. Also recommendations in sync with
    // the gaps. Also the learning path in sync with the
    // recommendations. Failure here must not fail the mapping
    // response, since mapping succeeded and is the primary result.
    try {
      await calculateAndStoreSkillGaps(req.user.id);
      await generateRecommendations(req.user.id);
      await generateLearningPath(req.user.id);
    } catch (gapErr) {
      console.error('[RefreshMyMapping -> Skill Gap/Recommendation/Path Error]', gapErr.message);
    }
    return res.json({ success: true, message: 'Competency mapping updated.', mapped: result.mapped });
  } catch (err) {
    console.error('[RefreshMyMapping Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error generating competency mapping.' });
  }
}

module.exports = { getMyMapping, refreshMyMapping };
