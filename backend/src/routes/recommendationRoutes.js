// backend/src/routes/recommendationRoutes.js
const express = require('express');
const router = express.Router();
const { getMyRecommendations, refreshMyRecommendations } = require('../controllers/recommendationController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/', getMyRecommendations);
router.post('/refresh', refreshMyRecommendations);

module.exports = router;
