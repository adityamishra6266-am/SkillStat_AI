// backend/src/providers/nssta/mockNsstaProvider.js
// Mock NSSTA / TPAC provider adapter.
//
// PROTOTYPE / MOCK INTEGRATION — this is NOT a real call to any NSSTA
// or TPAC API. There is no verified live NSSTA API access configured
// in this project. This module returns a small, realistic, in-memory
// demo catalog shaped exactly like the ProviderResource contract
// (see ../learningProvider.js), so it can be swapped for a real
// `nsstaLiveProvider.js` later without any caller needing to change.
//
// Every resource below is clearly a prototype: no real training URLs,
// no real enrollment IDs — just demo data illustrating the kind of
// training NSSTA/TPAC would plausibly offer for these competencies.

const CATALOG = [
  {
    externalId: 'NSSTA-DEMO-001',
    title: 'Advanced Sampling Methodology',
    description: 'In-depth training on multi-stage and cluster sampling design for national surveys.',
    competencyCode: 'SAMPLING',
    difficulty: 'Hard',
    durationHours: 8,
    resourceType: 'TRAINING',
  },
  {
    externalId: 'NSSTA-DEMO-002',
    title: 'Data Quality Assurance for Statistical Systems',
    description: 'Frameworks and checks for ensuring accuracy, completeness, and consistency in official data.',
    competencyCode: 'DATA_QUALITY',
    difficulty: 'Medium',
    durationHours: 6,
    resourceType: 'TRAINING',
  },
  {
    externalId: 'NSSTA-DEMO-003',
    title: 'Statistical Database Management for Officers',
    description: 'Designing and maintaining statistical databases used across government survey operations.',
    competencyCode: 'DB_MGMT',
    difficulty: 'Medium',
    durationHours: 7,
    resourceType: 'TRAINING',
  },
  {
    externalId: 'NSSTA-DEMO-004',
    title: 'Applied Statistical Methods for Survey Officers',
    description: 'Hypothesis testing and estimation techniques applied to national survey data.',
    competencyCode: 'STAT_METHODS',
    difficulty: 'Hard',
    durationHours: 8,
    resourceType: 'TRAINING',
  },
];

/**
 * Returns the demo NSSTA resources for one competency. `context` is
 * accepted per the provider contract but unused by this mock
 * implementation — see mockIgotProvider.js for the same note.
 */
async function getResourcesForCompetency(competencyCode /* , context */) {
  return CATALOG.filter((r) => r.competencyCode === competencyCode);
}

module.exports = {
  key: 'NSSTA',
  mode: 'mock',
  getResourcesForCompetency,
};
