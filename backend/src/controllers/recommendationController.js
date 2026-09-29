// backend/src/controllers/recommendationController.js
// exposes the recommendation engine over HTTP, scoped to
// the authenticated user (same convention as skillGapController /
// competencyMappingController: no :id in the URL, req.user.id from
// the JWT).

const { generateRecommendations, getStoredRecommendations, getGapsWithoutResources } = require('../services/recommendationService');
const { generateLearningPath } = require('../services/learningPathService');

// GET /api/recommendations
// Fast path: reads whatever is already stored. If the user has never
// had recommendations generated yet (first visit), computes and
// stores them on the fly so the page always shows something
// meaningful without a separate "generate" click.
//
// `unavailable` (open gaps with zero candidate resources in the mock
// catalog) is always recomputed fresh, not cached — see
// recommendationService.getGapsWithoutResources for why it can't be
// stored as a `recommendations` row.
async function getMyRecommendations(req, res) {
  try {
    let recommendations = await getStoredRecommendations(req.user.id);
    let message = null;

    if (recommendations.length === 0) {
      const result = await generateRecommendations(req.user.id);
      recommendations = result.recommendations;
      message = result.message;
    }

    const unavailable = await getGapsWithoutResources(req.user.id);

    return res.json({ success: true, recommendations, unavailable, message });
  } catch (err) {
    console.error('[GetMyRecommendations Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching recommendations.' });
  }
}

// POST /api/recommendations/refresh
// Explicitly recomputes recommendations from the latest stored skill
// gaps — e.g. a "Refresh" button, or after skill gaps change.
async function refreshMyRecommendations(req, res) {
  try {
    const result = await generateRecommendations(req.user.id);
    const unavailable = await getGapsWithoutResources(req.user.id);
    // keep the learning path in sync whenever recommendations
    // are explicitly refreshed. Failure here must not fail the
    // recommendation response, since that succeeded and is primary.
    try {
      await generateLearningPath(req.user.id);
    } catch (pathErr) {
      console.error('[RefreshMyRecommendations -> Learning Path Error]', pathErr.message);
    }
    return res.json({
      success: true,
      message: result.message || 'Recommendations updated.',
      recommendations: result.recommendations,
      unavailable,
    });
  } catch (err) {
    console.error('[RefreshMyRecommendations Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error generating recommendations.' });
  }
}

module.exports = { getMyRecommendations, refreshMyRecommendations };
