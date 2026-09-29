// backend/src/routes/learningPathRoutes.js
const express = require('express');
const router = express.Router();
const {
  getMyLearningPath,
  refreshMyLearningPath,
  startMyItem,
  updateMyItemProgress,
  completeMyItem,
} = require('../controllers/learningPathController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/', getMyLearningPath);
router.post('/refresh', refreshMyLearningPath);
router.post('/items/:itemId/start', startMyItem);
router.put('/items/:itemId/progress', updateMyItemProgress);
router.post('/items/:itemId/complete', completeMyItem);

module.exports = router;
