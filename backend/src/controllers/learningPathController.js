// backend/src/controllers/learningPathController.js
// exposes the learning path service over HTTP, scoped to
// the authenticated user (same convention as recommendationController
// / skillGapController: no :id in the URL for the path itself,
// req.user.id from the JWT; item ids in the path are the only ids
// accepted, and ownership is checked in the service layer).

const { generateLearningPath, getLearningPath, startItem, updateItemProgress, completeItem } = require('../services/learningPathService');

const ERROR_STATUS = {
  not_found: 404,
  locked: 409,
  already_completed: 409,
};

const ERROR_MESSAGE = {
  not_found: 'Learning path item not found.',
  locked: 'This step is locked until its prerequisite is completed.',
  already_completed: 'This step is already marked completed.',
};

function respondError(res, error) {
  return res.status(ERROR_STATUS[error] || 400).json({ success: false, message: ERROR_MESSAGE[error] || 'Request could not be completed.' });
}

// GET /api/learning-path
// Fast path: reads the user's active path. If they've never had one
// generated (first visit), generates it on the fly.
async function getMyLearningPath(req, res) {
  try {
    let path = await getLearningPath(req.user.id);
    if (!path || path.items.length === 0) {
      const result = await generateLearningPath(req.user.id);
      path = await getLearningPath(req.user.id);
      if (!path) {
        return res.json({ success: true, path: null, message: result.message });
      }
    }
    return res.json({ success: true, path, message: null });
  } catch (err) {
    console.error('[GetMyLearningPath Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching learning path.' });
  }
}

// POST /api/learning-path/refresh
// Explicitly regenerates/re-sequences the path from the latest
// recommendations — safe to call repeatedly, never loses progress.
async function refreshMyLearningPath(req, res) {
  try {
    await generateLearningPath(req.user.id);
    const path = await getLearningPath(req.user.id);
    return res.json({ success: true, path, message: path ? null : 'No open skill gaps with recommended resources yet.' });
  } catch (err) {
    console.error('[RefreshMyLearningPath Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error regenerating learning path.' });
  }
}

// POST /api/learning-path/items/:itemId/start
async function startMyItem(req, res) {
  try {
    const result = await startItem(req.user.id, req.params.itemId);
    if (result.error) return respondError(res, result.error);
    const path = await getLearningPath(req.user.id);
    return res.json({ success: true, path });
  } catch (err) {
    console.error('[StartMyItem Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error starting learning item.' });
  }
}

// PUT /api/learning-path/items/:itemId/progress
// Body: { progressPercentage: number (0-100) }
async function updateMyItemProgress(req, res) {
  try {
    const { progressPercentage } = req.body;
    if (progressPercentage === undefined || progressPercentage === null || isNaN(Number(progressPercentage))) {
      return res.status(400).json({ success: false, message: 'progressPercentage (a number 0-100) is required.' });
    }
    const result = await updateItemProgress(req.user.id, req.params.itemId, progressPercentage);
    if (result.error) return respondError(res, result.error);
    const path = await getLearningPath(req.user.id);
    return res.json({ success: true, path });
  } catch (err) {
    console.error('[UpdateMyItemProgress Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error updating progress.' });
  }
}

// POST /api/learning-path/items/:itemId/complete
async function completeMyItem(req, res) {
  try {
    const result = await completeItem(req.user.id, req.params.itemId);
    if (result.error) return respondError(res, result.error);
    const path = await getLearningPath(req.user.id);
    return res.json({ success: true, path });
  } catch (err) {
    console.error('[CompleteMyItem Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error completing learning item.' });
  }
}

module.exports = { getMyLearningPath, refreshMyLearningPath, startMyItem, updateMyItemProgress, completeMyItem };
