// backend/src/providers/igot/mockIgotProvider.js
// Mock iGOT Karmayogi provider adapter.
//
// PROTOTYPE / MOCK INTEGRATION — this is NOT a real call to any iGOT
// Karmayogi API. There is no verified live iGOT API access configured
// in this project. This module returns a small, realistic, in-memory
// demo catalog shaped exactly like the ProviderResource contract
// (see ../learningProvider.js), so it can be swapped for a real
// `igotLiveProvider.js` later without any caller needing to change.
//
// Every resource below is clearly a prototype: no real course URLs,
// no real enrollment IDs — just demo data illustrating the kind of
// content iGOT Karmayogi would plausibly host for these competencies.

const CATALOG = [
  {
    externalId: 'IGOT-DEMO-001',
    title: 'Introduction to Statistical Data Analysis',
    description: 'A foundational course on interpreting and summarizing statistical data for public administration.',
    competencyCode: 'DATA_ANALYSIS',
    difficulty: 'Easy',
    durationHours: 6,
    resourceType: 'COURSE',
  },
  {
    externalId: 'IGOT-DEMO-002',
    title: 'Sampling Techniques for Government Surveys',
    description: 'Covers random, stratified, and systematic sampling as applied in large-scale government surveys.',
    competencyCode: 'SAMPLING',
    difficulty: 'Medium',
    durationHours: 6,
    resourceType: 'COURSE',
  },
  {
    externalId: 'IGOT-DEMO-003',
    title: 'Foundations of Official Statistics',
    description: 'An orientation course on the role and structure of official statistics in public policy.',
    competencyCode: 'STAT_METHODS',
    difficulty: 'Easy',
    durationHours: 5,
    resourceType: 'COURSE',
  },
  {
    externalId: 'IGOT-DEMO-004',
    title: 'Python for Public Sector Data Tasks',
    description: 'Practical Python scripting for cleaning and summarizing administrative datasets.',
    competencyCode: 'PROGRAMMING',
    difficulty: 'Medium',
    durationHours: 7,
    resourceType: 'COURSE',
  },
  {
    externalId: 'IGOT-DEMO-005',
    title: 'Data Visualization for Policy Communication',
    description: 'Building clear charts and dashboards to communicate statistical findings to decision-makers.',
    competencyCode: 'DATA_VIZ',
    difficulty: 'Medium',
    durationHours: 4,
    resourceType: 'COURSE',
  },
];

/**
 * Returns the demo iGOT resources for one competency. `context`
 * (current/required level, gap, priority) is accepted per the
 * provider contract but this mock implementation doesn't need it —
 * it just filters its static catalog by competency code. A future
 * live adapter would use `context` to query iGOT's real search API.
 */
async function getResourcesForCompetency(competencyCode /* , context */) {
  return CATALOG.filter((r) => r.competencyCode === competencyCode);
}

module.exports = {
  key: 'IGOT',
  mode: 'mock',
  getResourcesForCompetency,
};
