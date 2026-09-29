// backend/src/providers/local/localCatalogProvider.js
// Local Catalog provider adapter.
//
// This is NOT a mock of an external platform — it's a thin adapter
// over the project's own pre-existing `learning_resources` catalog
// (source = 'MOCK_INTEGRATION', seeded in
// database/seeds/competency_seed.sql since the first version). It exists so the
// provider resolver can report on and count local-catalog resources
// the same way it does for iGOT/NSSTA, without the recommendation
// engine needing a special case for "no provider".

const { pool } = require('../../config/db');
const { PROVIDER_SOURCE } = require('../../config/providerConfig');

async function getResourcesForCompetency(competencyCode) {
  const [rows] = await pool.query(
    `SELECT lr.id, lr.title, lr.description, lr.difficulty, lr.estimated_duration, lr.external_id
     FROM learning_resources lr
     JOIN competencies c ON c.id = lr.competency_id
     WHERE c.code = ? AND lr.source = ?`,
    [competencyCode, PROVIDER_SOURCE.LOCAL]
  );
  return rows;
}

async function countResources() {
  const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM learning_resources WHERE source = ?', [
    PROVIDER_SOURCE.LOCAL,
  ]);
  return row.count;
}

module.exports = {
  key: 'LOCAL',
  mode: 'mock', // the prototype catalog is, by definition, not a live external integration
  getResourcesForCompetency,
  countResources,
};
