// backend/src/routes/skillGapRoutes.js
const express = require('express');
const router = express.Router();
const { getMySkillGaps, refreshMySkillGaps } = require('../controllers/skillGapController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/', getMySkillGaps);
router.post('/refresh', refreshMySkillGaps);

module.exports = router;
