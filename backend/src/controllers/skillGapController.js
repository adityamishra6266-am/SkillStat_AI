// backend/src/controllers/skillGapController.js
// exposes skill gap analysis over HTTP, scoped to the
// authenticated user (same convention as competencyMappingController:
// no :id in the URL, req.user.id from the JWT).

const {
  calculateAndStoreSkillGaps,
  getStoredSkillGaps,
  getUnmappedCompetencies,
  buildSummary,
} = require('../services/skillGapService');
const { generateRecommendations } = require('../services/recommendationService');
const { generateLearningPath } = require('../services/learningPathService');

// GET /api/skill-gaps
// Fast path: reads whatever is already stored. If the user has never
// had gaps calculated yet (first visit), computes and stores them on
// the fly so the page always shows something meaningful.
async function getMySkillGaps(req, res) {
  try {
    let gaps = await getStoredSkillGaps(req.user.id);
    let unmapped;
    let message = null;

    if (gaps.length === 0) {
      const result = await calculateAndStoreSkillGaps(req.user.id);
      gaps = result.gaps;
      unmapped = result.unmapped;
      if (gaps.length === 0 && unmapped.length === 0) {
        message = result.message;
      }
    } else {
      unmapped = await getUnmappedCompetencies(req.user.id);
    }

    return res.json({
      success: true,
      gaps,
      unmapped,
      summary: buildSummary(gaps),
      message,
    });
  } catch (err) {
    console.error('[GetMySkillGaps Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching skill gaps.' });
  }
}

// POST /api/skill-gaps/refresh
// Explicitly recomputes gaps from the latest stored competency
// mapping — e.g. a "Recalculate" button, or after a quiz updates
// competency levels in the adaptive loop (adaptiveLoopService).
async function refreshMySkillGaps(req, res) {
  try {
    const result = await calculateAndStoreSkillGaps(req.user.id);
    if (result.gaps.length === 0 && result.unmapped.length === 0) {
      return res.status(422).json({ success: false, message: result.message });
    }
    // keep recommendations in sync whenever gaps are
    // explicitly recalculated. Also the learning path in sync
    // with the recommendations. Failure here must not fail the skill
    // gap response, since gap calculation succeeded and is the
    // primary result of this endpoint.
    try {
      await generateRecommendations(req.user.id);
      await generateLearningPath(req.user.id);
    } catch (recErr) {
      console.error('[RefreshMySkillGaps -> Recommendation/Path Error]', recErr.message);
    }
    return res.json({
      success: true,
      message: 'Skill gaps recalculated.',
      gaps: result.gaps,
      unmapped: result.unmapped,
      summary: buildSummary(result.gaps),
    });
  } catch (err) {
    console.error('[RefreshMySkillGaps Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error recalculating skill gaps.' });
  }
}

module.exports = { getMySkillGaps, refreshMySkillGaps };
