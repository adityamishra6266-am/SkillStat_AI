// backend/src/config/competencyMappingConfig.js
// Tunable heuristics for the rule-based competency mapping baseline.
// Kept in one place, separate from the scoring logic, so
// the weightings and keyword affinities can be adjusted without
// touching the service code — and so no competency codes are
// scattered/hard-coded across controllers or the frontend.
//
// IMPORTANT: none of this is an official government standard. It is
// a configurable, editable starting point for turning a learner's
// self-reported profile into an initial competency estimate before
// any real assessment evidence exists.

// Points contributed by each scoring factor. All on a 0-100 scale.
const WEIGHTS = {
  MAX_EXPERIENCE_POINTS: 40, // cap on years-of-experience contribution
  POINTS_PER_YEAR: 6, // each year of experience is worth this many points, up to the cap
  SKILL_LEVEL_POINTS: {
    Beginner: 10,
    Intermediate: 25,
    Advanced: 40,
  },
  QUALIFICATION_MATCH_POINTS: 15,
  INTEREST_MATCH_POINTS: 10,
};

// Assessment-evidence blending: each answered question tagged with a
// competency shifts more weight onto real evidence and away from the
// profile-based guess, up to a cap (so a handful of questions never
// fully overrides the profile estimate on their own, but a solid
// assessment history dominates it).
//   - diagnostic-assessment question (exact curated mapping): 0.15 each
//   - document-quiz question (tests comprehension of ONE document, mapped
//     with a confidence < 1): 0.06 each, further scaled by mapping confidence
const EVIDENCE_WEIGHT_PER_QUESTION = 0.15;
const DOCUMENT_EVIDENCE_WEIGHT_PER_QUESTION = 0.06;
const EVIDENCE_WEIGHT_CAP = 0.75;
const HIGH_CONFIDENCE_EVIDENCE_WEIGHT = 0.45;

// Qualification keyword -> competency codes it lends credibility to.
// Matched case-insensitively as a substring of the profile's free-text
// `qualification` field.
const QUALIFICATION_AFFINITY = {
  'computer': ['PROGRAMMING', 'DB_MGMT', 'STAT_COMPUTING', 'MACHINE_LEARNING'],
  'mca': ['PROGRAMMING', 'DB_MGMT', 'STAT_COMPUTING'],
  'bca': ['PROGRAMMING', 'DB_MGMT'],
  'information technology': ['PROGRAMMING', 'DB_MGMT', 'STAT_COMPUTING'],
  'statistics': ['STAT_METHODS', 'SAMPLING', 'OFFICIAL_STATS', 'DATA_ANALYSIS'],
  'msc statistics': ['STAT_METHODS', 'SAMPLING', 'OFFICIAL_STATS', 'DATA_ANALYSIS'],
  'economics': ['STAT_METHODS', 'OFFICIAL_STATS', 'DATA_ANALYSIS'],
  'mathematics': ['STAT_METHODS', 'MACHINE_LEARNING', 'STAT_COMPUTING'],
  'data science': ['MACHINE_LEARNING', 'DATA_ANALYSIS', 'PROGRAMMING', 'DATA_VIZ'],
  'mba': ['DATA_ANALYSIS', 'DATA_VIZ'],
  'commerce': ['DATA_ANALYSIS', 'DATA_MGMT'],
  'engineering': ['PROGRAMMING', 'STAT_COMPUTING', 'DB_MGMT'],
};

// Competency codes -> extra keywords to match against the profile's
// free-text `interests` field (beyond the competency's own name).
const INTEREST_KEYWORDS = {
  STAT_METHODS: ['statistics', 'statistical methods', 'hypothesis testing'],
  STAT_COMPUTING: ['statistical computing', 'r programming', 'computing'],
  DATA_ANALYSIS: ['data analysis', 'analytics'],
  DATA_MGMT: ['data management'],
  DB_MGMT: ['database', 'sql'],
  DATA_VIZ: ['visualization', 'dashboards', 'charts'],
  PROGRAMMING: ['python', 'programming', 'coding'],
  MACHINE_LEARNING: ['machine learning', 'ai', 'artificial intelligence', 'ml'],
  STAT_SOFTWARE: ['spss', 'stata', 'r software'],
  DATA_QUALITY: ['data quality'],
  SAMPLING: ['sampling', 'survey design', 'surveys'],
  OFFICIAL_STATS: ['official statistics', 'national statistics'],
};

module.exports = {
  WEIGHTS,
  EVIDENCE_WEIGHT_PER_QUESTION,
  DOCUMENT_EVIDENCE_WEIGHT_PER_QUESTION,
  EVIDENCE_WEIGHT_CAP,
  HIGH_CONFIDENCE_EVIDENCE_WEIGHT,
  QUALIFICATION_AFFINITY,
  INTEREST_KEYWORDS,
};
