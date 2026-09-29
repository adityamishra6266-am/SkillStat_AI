// backend/src/routes/providerRoutes.js
// read-only provider status route (rule 15).
const express = require('express');
const router = express.Router();
const { getStatus } = require('../controllers/providerController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);
router.get('/status', getStatus);

module.exports = router;
