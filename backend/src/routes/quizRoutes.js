// backend/src/routes/quizRoutes.js
const express = require('express');
const router = express.Router();
const { getQuiz, submitQuiz } = require('../controllers/quizController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/:id', getQuiz);
router.post('/:id/submit', submitQuiz);

module.exports = router;
