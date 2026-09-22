// backend/src/routes/resultRoutes.js
const express = require('express');
const router = express.Router();
const { listResults, getResult } = require('../controllers/resultController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/', listResults);
router.get('/:id', getResult);

module.exports = router;
