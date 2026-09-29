// backend/src/routes/competencyRoutes.js
const express = require('express');
const router = express.Router();
const { listCompetencies, getCompetency } = require('../controllers/competencyController');
const { getMyMapping, refreshMyMapping } = require('../controllers/competencyMappingController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// NOTE: '/mapping' must be declared before the '/:id' route below,
// otherwise Express would match it as getCompetency({ id: 'mapping' }).
router.get('/mapping', getMyMapping);
router.post('/mapping', refreshMyMapping);

router.get('/', listCompetencies);
router.get('/:id', getCompetency);

module.exports = router;
