// backend/src/providers/providerResolver.js
// Provider Resolver.
//
//                 RECOMMENDATION ENGINE
//                          |
//                  (reads learning_resources,
//                   unchanged from the first version)
//                          |
//                 PROVIDER RESOLVER (this file)
//                    /          \            \
//                   /            \            \
//        iGOT Provider     NSSTA Provider   Local Catalog
//         (mock adapter)   (mock adapter)    (existing data)
//
// The recommendation engine (recommendationService.js) does NOT call
// this module per-request — it keeps reading `learning_resources`
// directly (see getCandidateResources there), exactly as it has since
// the original design. What THIS module does is keep that one table stocked with
// each provider's resources, tagged with that provider's own
// `source`, so the existing ranking/reason/persistence logic works
// unmodified across all three sources at once.
//
// syncProviderCatalog() is called once at server startup (see
// server.js). It is safe to call repeatedly (idempotent upsert) and
// safe to call with the DB temporarily unavailable (logs and
// continues — matches the existing testConnection() convention of
// never blocking startup).
//
// LIVE MODE SAFETY (rule 14 of the existing design)
// ------------------------------------------------
// If IGOT_PROVIDER_MODE or NSSTA_PROVIDER_MODE is ever set to 'live',
// this project has no live adapter to satisfy that — so instead of
// silently serving mock data under a 'live' label, the resolver skips
// syncing that provider's mock catalog and logs a clear
// "not configured" warning. The recommendation engine still works
// off whatever real providers ARE available (rule 25: one provider
// being unavailable must not break the page).

const { pool } = require('../config/db');
const { PROVIDER_SOURCE, getProviderMode } = require('../config/providerConfig');
const { normalizeToResourceRow } = require('./learningProvider');
const igotProvider = require('./igot/mockIgotProvider');
const nsstaProvider = require('./nssta/mockNsstaProvider');
const localCatalogProvider = require('./local/localCatalogProvider');

const MOCK_PROVIDERS = [
  { source: PROVIDER_SOURCE.IGOT, adapter: igotProvider, modeKey: 'IGOT' },
  { source: PROVIDER_SOURCE.NSSTA, adapter: nsstaProvider, modeKey: 'NSSTA' },
];

/**
 * Upserts one provider's full demo catalog into `learning_resources`,
 * matching each resource's `competencyCode` to `competencies.code`.
 * Unmatched competency codes are skipped with a warning rather than
 * failing the whole sync (a typo in a provider's demo data should
 * never take down every provider).
 */
async function syncOneProvider({ source, adapter }) {
  const mode = getProviderMode(adapter.key);
  if (mode !== 'mock') {
    console.warn(
      `[ProviderResolver] ${adapter.key} is configured for '${mode}' mode, but no live ${adapter.key} adapter ` +
        `is implemented in this project (no verified API credentials). Skipping catalog sync for ${adapter.key} — ` +
        `it will not appear in recommendations until a real adapter is added, or its mode is set back to 'mock'.`
    );
    return { synced: 0, skipped: true };
  }

  // The mock adapters are keyed by competency code, not id, so their
  // demo data stays readable and independent of DB auto-increment
  // ordering. Ask each adapter for every competency it might have —
  // simplest is to ask it for all distinct codes in its own catalog.
  const codes = [...new Set((await getAllResourcesFlat(adapter)).map((r) => r.competencyCode))];

  let synced = 0;
  for (const code of codes) {
    const [competencyRows] = await pool.query('SELECT id FROM competencies WHERE code = ?', [code]);
    if (competencyRows.length === 0) {
      console.warn(`[ProviderResolver] ${adapter.key}: unknown competency code '${code}', skipping its resources.`);
      continue;
    }
    const competencyId = competencyRows[0].id;
    const resources = await adapter.getResourcesForCompetency(code);
    for (const resource of resources) {
      const row = normalizeToResourceRow(resource, { source, isMock: true });
      await pool.query(
        `INSERT INTO learning_resources
           (title, competency_id, topic, difficulty, learning_type, source, external_id, description, estimated_duration, url, is_mock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           topic = VALUES(topic),
           difficulty = VALUES(difficulty),
           learning_type = VALUES(learning_type),
           source = VALUES(source),
           external_id = VALUES(external_id),
           description = VALUES(description),
           estimated_duration = VALUES(estimated_duration),
           is_mock = VALUES(is_mock)`,
        [
          row.title,
          competencyId,
          row.topic,
          row.difficulty,
          row.learning_type,
          row.source,
          row.external_id,
          row.description,
          row.estimated_duration,
          row.url,
          row.is_mock,
        ]
      );
      synced += 1;
    }
  }
  return { synced, skipped: false };
}

/** Small helper: an adapter's full catalog, regardless of competency, for code discovery during sync. */
async function getAllResourcesFlat(adapter) {
  // Mock adapters keep their catalog as a simple in-module array; the
  // cheapest way to discover every competency code without adding a
  // second method to the provider contract is to probe with the
  // codes we already know the project seeds (see providerConfig /
  // competency_seed.sql). This keeps the provider contract itself
  // minimal (just getResourcesForCompetency), matching rule 2's
  // "receive competency ... return learning resources" shape.
  const KNOWN_COMPETENCY_CODES = [
    'STAT_METHODS', 'STAT_COMPUTING', 'DATA_ANALYSIS', 'DATA_MGMT', 'DB_MGMT',
    'DATA_VIZ', 'PROGRAMMING', 'MACHINE_LEARNING', 'STAT_SOFTWARE', 'DATA_QUALITY',
    'SAMPLING', 'OFFICIAL_STATS',
  ];
  const all = [];
  for (const code of KNOWN_COMPETENCY_CODES) {
    const resources = await adapter.getResourcesForCompetency(code);
    all.push(...resources);
  }
  return all;
}

/**
 * Runs once at server startup. Never throws — a provider sync failure
 * (DB down, one adapter misbehaving) is logged and must not prevent
 * the server from starting, matching the existing testConnection()
 * convention.
 */
async function syncProviderCatalog() {
  for (const provider of MOCK_PROVIDERS) {
    try {
      const result = await syncOneProvider(provider);
      if (!result.skipped) {
        console.log(`[ProviderResolver] ${provider.adapter.key}: synced ${result.synced} prototype resource(s).`);
      }
    } catch (err) {
      console.error(`[ProviderResolver] ${provider.adapter.key} catalog sync failed:`, err.message);
      // Rule 25 — one provider failing must not crash the app or
      // prevent the others (or the local catalog) from working.
    }
  }
}

/**
 * Simple provider health/status for the SIH demo (rule 15) — no
 * network calls, just each provider's configured mode and how many
 * resources it currently has synced into the shared catalog.
 */
async function getProviderStatus() {
  const status = [];
  for (const { source, adapter } of MOCK_PROVIDERS) {
    const mode = getProviderMode(adapter.key);
    const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM learning_resources WHERE source = ?', [source]);
    status.push({ provider: adapter.key, mode, resourceCount: row.count });
  }
  status.push({ provider: 'LOCAL', mode: 'mock', resourceCount: await localCatalogProvider.countResources() });
  return status;
}

module.exports = { syncProviderCatalog, getProviderStatus };
