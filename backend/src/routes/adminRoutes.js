// backend/src/routes/adminRoutes.js
// Every route here requires a valid JWT (authMiddleware) AND role = 'admin'
// (adminOnly). A learner calling any of these directly (not just clicking a
// hidden button) gets 403 Forbidden - this is the real security boundary; the
// frontend hiding the /admin link is only a convenience.
const express = require('express');
const router = express.Router();
const { getDashboard, getOfficial } = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

router.use(authMiddleware);
router.use(adminOnly);

router.get('/dashboard', getDashboard);
router.get('/officials/:id', getOfficial);

module.exports = router;
