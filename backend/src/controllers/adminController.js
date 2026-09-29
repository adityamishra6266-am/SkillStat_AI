// backend/src/controllers/adminController.js
// Exposes adminAnalyticsService over HTTP. Every route served here sits behind
// authMiddleware + adminOnly (see routes/adminRoutes.js) - a learner token
// never reaches this code.

const { getAdminDashboard, getOfficialDetail, normalizeRangeDays } = require('../services/adminAnalyticsService');

// GET /api/admin/dashboard?range=7|30|90
// One consolidated, read-only payload for the whole Administrator Dashboard.
// Loading it never recalculates or writes anything. `range` (days) only limits
// the assessment analytics / per-official attempt counts; omit it for all time.
async function getDashboard(req, res) {
  try {
    if (req.query.range !== undefined && req.query.range !== 'all' && normalizeRangeDays(req.query.range) === null) {
      return res.status(400).json({ success: false, message: 'range must be 7, 30, 90 or omitted for all time.' });
    }
    const dashboard = await getAdminDashboard({ rangeDays: req.query.range });
    return res.json({ success: true, dashboard });
  } catch (err) {
    console.error('[Admin GetDashboard Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching admin dashboard data.' });
  }
}

// GET /api/admin/officials/:id
async function getOfficial(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid official id.' });
    }
    const official = await getOfficialDetail(id);
    if (!official) {
      return res.status(404).json({ success: false, message: 'Official not found.' });
    }
    return res.json({ success: true, official });
  } catch (err) {
    console.error('[Admin GetOfficial Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching official details.' });
  }
}

module.exports = { getDashboard, getOfficial };
