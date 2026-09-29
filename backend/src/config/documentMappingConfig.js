// backend/src/config/documentMappingConfig.js
// Configuration for mapping an uploaded learning document's quiz questions to
// the EXISTING competency framework (the `competencies` table).
//
// IMPORTANT: this is a deterministic FALLBACK used when no LLM is configured
// (or the LLM cannot classify a question with enough confidence). It does not
// invent competencies: it only ever assigns a code that exists in the
// `competencies` table, and only when the evidence is strong. When it is not,
// the question stays unmapped (competency_id NULL) and the UI says so.
//
// Each competency code lists weighted terms:
//   3 = distinctive phrase (strong signal)
//   2 = distinctive single word / technical term
//   1 = generic supporting word
// Terms are matched as whole words/phrases (never as raw substrings, so short
// tokens such as "ai" cannot match "maintain").

const COMPETENCY_TERMS = {
  STAT_METHODS: [
    ['hypothesis test', 3], ['hypothesis testing', 3], ['null hypothesis', 3], ['p-value', 3], ['confidence interval', 3],
    ['standard deviation', 3], ['regression analysis', 3], ['linear regression', 3], ['probability distribution', 3],
    ['central limit theorem', 3], ['inferential statistics', 3], ['descriptive statistics', 3], ['statistical inference', 3],
    ['normal distribution', 3], ['significance level', 3], ['correlation coefficient', 3], ['variance', 2], ['median', 2],
    ['mean', 1], ['probability', 2], ['estimator', 2], ['t-test', 3], ['chi-square', 3], ['anova', 3], ['outlier', 2],
    ['statistics', 1], ['statistical', 1],
  ],
  STAT_COMPUTING: [
    ['statistical computing', 3], ['computational statistics', 3], ['monte carlo', 3], ['simulation', 2], ['bootstrap', 3],
    ['r programming', 3], ['numpy', 2], ['scipy', 2], ['pandas', 2], ['reproducible analysis', 3], ['scripting', 1],
  ],
  DATA_ANALYSIS: [
    ['data analysis', 3], ['exploratory data analysis', 3], ['trend analysis', 3], ['time series', 3], ['data interpretation', 3],
    ['cross-tabulation', 3], ['pivot table', 3], ['summary statistics', 3], ['analytics', 2], ['insights', 1],
    ['aggregation', 2], ['dataset', 1], ['indicator', 1], ['analyse', 1], ['analyze', 1],
  ],
  DATA_MGMT: [
    ['data management', 3], ['data lifecycle', 3], ['data governance', 3], ['data cleaning', 3], ['data collection', 3],
    ['metadata', 3], ['data dictionary', 3], ['data archiving', 3], ['data retention', 3], ['data integration', 3],
    ['data standard', 2], ['data stewardship', 3], ['data storage', 2],
  ],
  DB_MGMT: [
    ['database', 3], ['sql', 3], ['relational database', 3], ['primary key', 3], ['foreign key', 3], ['normalization', 3],
    ['normalisation', 3], ['join', 2], ['query', 2], ['mysql', 3], ['postgresql', 3], ['nosql', 3], ['schema', 2],
    ['index', 1], ['table', 1], ['dbms', 3], ['transaction', 2],
  ],
  DATA_VIZ: [
    ['data visualization', 3], ['data visualisation', 3], ['dashboard', 3], ['bar chart', 3], ['line chart', 3], ['pie chart', 3],
    ['histogram', 3], ['scatter plot', 3], ['infographic', 3], ['choropleth', 3], ['chart', 2], ['visual storytelling', 3],
    ['heat map', 3], ['heatmap', 3], ['tableau', 3], ['power bi', 3], ['axis', 1], ['plot', 1],
  ],
  PROGRAMMING: [
    ['python', 3], ['programming', 3], ['function', 1], ['variable', 1], ['loop', 1], ['algorithm', 2], ['source code', 3],
    ['debugging', 3], ['library', 1], ['script', 1], ['java', 2], ['javascript', 3], ['class', 1], ['list comprehension', 3],
    ['data structure', 3], ['object-oriented', 3], ['api', 1],
  ],
  MACHINE_LEARNING: [
    ['machine learning', 3], ['neural network', 3], ['deep learning', 3], ['supervised learning', 3], ['unsupervised learning', 3],
    ['training data', 3], ['overfitting', 3], ['classification model', 3], ['random forest', 3], ['decision tree', 3],
    ['clustering', 3], ['feature engineering', 3], ['artificial intelligence', 3], ['model accuracy', 2], ['gradient descent', 3],
    ['k-means', 3], ['cross-validation', 3],
  ],
  STAT_SOFTWARE: [
    ['spss', 3], ['stata', 3], ['sas software', 3], ['r software', 3], ['rstudio', 3], ['statistical software', 3],
    ['statistical package', 3], ['eviews', 3], ['minitab', 3], ['excel', 1],
  ],
  DATA_QUALITY: [
    ['data quality', 3], ['data validation', 3], ['missing data', 3], ['missing values', 3], ['imputation', 3], ['data accuracy', 3],
    ['data completeness', 3], ['data consistency', 3], ['duplicate records', 3], ['data cleaning', 2], ['quality assurance', 3],
    ['non-response', 3], ['measurement error', 3], ['timeliness', 2], ['data timeliness', 3], ['coherence', 2], ['error', 1],
  ],
  SAMPLING: [
    ['sampling', 3], ['sample size', 3], ['random sample', 3], ['stratified sampling', 3], ['cluster sampling', 3],
    ['systematic sampling', 3], ['sampling frame', 3], ['sampling error', 3], ['survey design', 3], ['questionnaire', 3],
    ['survey', 2], ['respondent', 2], ['probability sampling', 3], ['non-probability', 3], ['population', 1], ['sample', 1],
    ['estimation', 1], ['household survey', 3],
  ],
  OFFICIAL_STATS: [
    ['official statistics', 3], ['national statistical office', 3], ['statistical system', 3], ['fundamental principles', 3],
    ['census', 3], ['national accounts', 3], ['gross domestic product', 3], ['gdp', 3], ['consumer price index', 3],
    ['cpi', 3], ['mospi', 3], ['nso', 3], ['nss', 2], ['national sample survey', 3], ['sdg indicators', 3], ['sdg', 2],
    ['statistical standards', 3], ['nsc', 2], ['inflation', 2], ['labour force survey', 3], ['periodic labour force', 3],
    ['statistical legislation', 3], ['public policy', 1],
  ],
};

module.exports = {
  COMPETENCY_TERMS,

  // A question-level mapping is only accepted when BOTH hold:
  MIN_TOP_SCORE: 4, // enough matched-term weight (e.g. one strong phrase + a support term, or two strong phrases)
  MIN_CONFIDENCE: 0.55, // confidence = top / (top + second + 3); ambiguous questions (close runner-up) fall below this

  // How much the uploaded document's own text nudges the question score
  // (context only - the question itself must still carry signal).
  DOCUMENT_CONTEXT_WEIGHT: 0.15,
  DOCUMENT_CONTEXT_CAP: 3,

  // LLM suggestions must clear this bar, otherwise the deterministic matcher decides.
  LLM_MIN_CONFIDENCE: 0.6,

  // Minimum mapping confidence for a document-quiz question to count as
  // competency evidence at all (also enforced when reading evidence back).
  EVIDENCE_MIN_CONFIDENCE: 0.55,
};
