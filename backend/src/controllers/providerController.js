// backend/src/controllers/providerController.js
// exposes read-only provider health/status (rule 15 of the
// brief): which providers exist, what mode each is in, and how many
// resources each currently contributes. No network calls are made —
// this is purely a read of `learning_resources`, useful for the SIH
// demo to show the architecture honestly.

const { getProviderStatus } = require('../providers/providerResolver');

// GET /api/providers/status
async function getStatus(req, res) {
  try {
    const providers = await getProviderStatus();
    return res.json({ success: true, providers });
  } catch (err) {
    console.error('[GetProviderStatus Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching provider status.' });
  }
}

module.exports = { getStatus };
