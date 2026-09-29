// backend/src/routes/diagnosticRoutes.js
const express = require('express');
const router = express.Router();
const { getStatus, start, history } = require('../controllers/diagnosticController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/status', getStatus);
router.post('/start', start);
router.get('/history', history);

module.exports = router;
