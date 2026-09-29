// backend/src/config/providerConfig.js
// configuration for the iGOT/NSSTA learning-provider layer.
//
// Nothing outside this file should hard-code a provider's display
// name, its env-driven mode, or its integration-status wording — the
// provider adapters and the frontend-facing serializers all read
// from here, so wiring up a real live adapter later is a config +
// adapter-swap change, not a rewrite.
//
// MODE
// ----
// Each provider's mode is read from its own env var, defaulting to
// 'mock' when unset. This project does NOT ship a live adapter for
// either provider — there are no verified iGOT/NSSTA API credentials
// available in this environment. If someone sets a provider's mode
// to 'live' anyway, the provider layer must fail safely (a clear
// "not configured" error) rather than silently serving mock data
// under a "live" label. See providers/providerResolver.js.

const PROVIDER_SOURCE = {
  IGOT: 'IGOT',
  NSSTA: 'NSSTA',
  LOCAL: 'MOCK_INTEGRATION', // unchanged from the original local catalog
};

const PROVIDER_META = {
  [PROVIDER_SOURCE.IGOT]: {
    key: 'IGOT',
    displayName: 'iGOT Karmayogi',
    modeEnvVar: 'IGOT_PROVIDER_MODE',
  },
  [PROVIDER_SOURCE.NSSTA]: {
    key: 'NSSTA',
    displayName: 'NSSTA / TPAC',
    modeEnvVar: 'NSSTA_PROVIDER_MODE',
  },
  [PROVIDER_SOURCE.LOCAL]: {
    key: 'LOCAL',
    displayName: 'SkillStat AI Prototype Catalog',
    modeEnvVar: null, // the local catalog has no live/mock distinction — it IS the app's own data
  },
};

/**
 * Reads a provider's configured mode from its env var. Defaults to
 * 'mock' — the only mode this project actually implements. Any value
 * other than 'mock' or 'live' is treated as 'mock' defensively
 * (never silently treated as 'live').
 */
function getProviderMode(providerKey) {
  const meta = PROVIDER_META[PROVIDER_SOURCE[providerKey]];
  if (!meta || !meta.modeEnvVar) return 'mock';
  const raw = (process.env[meta.modeEnvVar] || 'mock').trim().toLowerCase();
  return raw === 'live' ? 'live' : 'mock';
}

/**
 * Human-facing metadata for a resource's stored `source` value.
 * Falls back to a generic "Unknown source" shape rather than
 * throwing, since `source` is free-text at the DB layer and could in
 * principle hold something this config doesn't know about yet.
 */
function getProviderMetaBySource(source) {
  const meta = PROVIDER_META[source];
  if (!meta) {
    return { key: 'UNKNOWN', displayName: source || 'Unknown source', modeEnvVar: null };
  }
  return meta;
}

module.exports = {
  PROVIDER_SOURCE,
  PROVIDER_META,
  getProviderMode,
  getProviderMetaBySource,
};
