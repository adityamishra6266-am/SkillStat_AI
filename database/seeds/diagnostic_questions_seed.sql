-- ============================================================
-- SkillStat AI — Diagnostic Question Bank Seed Data
-- ============================================================
-- Deterministic, hand-authored MCQ bank used by the diagnostic
-- assessment (see backend/src/services/diagnosticAssessmentService.js).
-- This is the "reliable prototype fallback" referenced in the original diagnostic design
-- brief: when no external LLM is configured (the default for this
-- project — see ai-service/.env), the diagnostic assessment draws its
-- questions from here rather than pretending an AI model generated
-- them. Every question maps to one of the existing competencies seeded
-- in competency_seed.sql and covers a mix of Easy/Medium/Hard.
--
-- Run with (after 002-006 + competency_seed.sql are already applied):
--   mysql -u root -p skillstat_ai < database/seeds/diagnostic_questions_seed.sql
--
-- Safe to re-run: questions are inserted fresh only if the bank is
-- empty for that competency+question text combination is not checked
-- via a unique key (question text can legitimately repeat across a
-- reseed in dev), so this script guards itself with a DELETE of rows
-- it previously inserted (matched by a fixed marker) before
-- re-inserting, keeping it idempotent without a fragile UNIQUE key
-- on free-text question content.
-- ============================================================

USE skillstat_ai;

DELETE FROM diagnostic_questions WHERE explanation LIKE '%[seed:diagnostic_v1]%';

INSERT INTO diagnostic_questions
  (competency_id, question, option_a, option_b, option_c, option_d, correct_answer, difficulty, explanation)
SELECT c.id, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.difficulty, q.explanation
FROM (
  -- ---------------- Statistical Methods ----------------
  SELECT 'STAT_METHODS' code,
    'Which measure of central tendency is most affected by extreme outliers?' question,
    'Mean' option_a, 'Median' option_b, 'Mode' option_c, 'Range' option_d,
    0 correct_answer, 'Easy' difficulty,
    'The mean uses every value in its calculation, so a single very large or small outlier can pull it away from the bulk of the data, unlike the median or mode. [seed:diagnostic_v1]' explanation
  UNION ALL
  SELECT 'STAT_METHODS',
    'In hypothesis testing, what does the p-value represent?',
    'The probability that the null hypothesis is true',
    'The probability of observing data as extreme as, or more extreme than, the sample result, assuming the null hypothesis is true',
    'The probability that the alternative hypothesis is true',
    'The significance level chosen by the researcher',
    1, 'Medium',
    'The p-value is a conditional probability computed under the assumption that the null hypothesis holds — it is not the probability that either hypothesis is true. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'STAT_METHODS',
    'A Type II error in hypothesis testing occurs when:',
    'A true null hypothesis is rejected',
    'A false null hypothesis is not rejected',
    'A false null hypothesis is rejected',
    'A true null hypothesis is not rejected',
    1, 'Hard',
    'A Type II error is failing to reject a null hypothesis that is actually false — i.e. missing a real effect. Rejecting a true null hypothesis is a Type I error. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Statistical Computing ----------------
  SELECT 'STAT_COMPUTING',
    'Which of the following is a language widely used for statistical computing?',
    'R', 'HTML', 'CSS', 'Photoshop scripting',
    0, 'Easy',
    'R was purpose-built for statistical computing and graphics; HTML and CSS are markup/styling languages, not computational ones. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'STAT_COMPUTING',
    'In statistical computing, "vectorization" refers to:',
    'Drawing vector-based graphics for reports',
    'Performing operations on entire arrays/columns at once instead of writing explicit loops',
    'Converting text into word-embedding vectors for NLP',
    'Encrypting a dataset before analysis',
    1, 'Medium',
    'Vectorized operations apply a computation across a whole array in one step, which is both faster and more idiomatic in tools like R, NumPy, or pandas than manual looping. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'STAT_COMPUTING',
    'Which R data structure stores a 2-dimensional array where every element must be the same data type?',
    'list', 'data.frame', 'matrix', 'factor',
    2, 'Hard',
    'A matrix in R is strictly 2-dimensional and single-typed; a data.frame allows different column types, and list/factor are not 2-D homogeneous arrays. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Data Analysis ----------------
  SELECT 'DATA_ANALYSIS',
    'Exploratory Data Analysis (EDA) is primarily used to:',
    'Build the final production dashboard',
    'Understand the main characteristics of a dataset before formal modeling or reporting',
    'Encrypt sensitive fields in a dataset',
    'Design the survey questionnaire',
    1, 'Easy',
    'EDA is the investigative step of summarizing, visualizing, and understanding a dataset''s structure and quirks before deeper analysis or modeling begins. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_ANALYSIS',
    'A boxplot is most useful for visualizing:',
    'The relationship between two categorical variables',
    'The distribution, median, and potential outliers of a numeric variable',
    'Time-series trends only',
    'Network relationships between entities',
    1, 'Medium',
    'A boxplot summarizes a numeric variable''s quartiles, median, and outliers in one view — it is not designed for categorical relationships, pure time trends, or network data. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_ANALYSIS',
    'Which correlation coefficient value indicates the strongest linear relationship (regardless of direction)?',
    '0.9', '0.0', '-0.95', '-0.2',
    2, 'Hard',
    'Correlation strength is judged by absolute value: |-0.95| = 0.95 is stronger than 0.9, 0.0 (no relationship), or -0.2 (weak). [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Data Management ----------------
  SELECT 'DATA_MGMT',
    'What is the primary purpose of data cleaning?',
    'Increasing the file size for storage benchmarking',
    'Identifying and correcting errors, duplicates, or inconsistencies in a dataset',
    'Formatting a dataset for printing only',
    'Encrypting a dataset for transmission',
    1, 'Easy',
    'Data cleaning is about improving data quality — fixing errors, duplicates, and inconsistencies — not about file size, print formatting, or encryption. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_MGMT',
    'Which of the following best describes "data lifecycle management"?',
    'Managing data only during its initial collection',
    'Managing data from creation/collection through storage, use, archival, and eventual disposal',
    'Only backing up data on a fixed schedule',
    'Formatting spreadsheets for a report',
    1, 'Medium',
    'Data lifecycle management covers every stage a dataset passes through, not just collection or backups. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_MGMT',
    'In data management, "data lineage" refers to:',
    'The physical location of the server hosting the data',
    'The historical record of data''s origins, movements, and transformations',
    'The file-naming convention used by a team',
    'The number of people who have viewed a dataset',
    1, 'Hard',
    'Data lineage traces where data came from and how it has been transformed and moved over time — important for auditability and trust in official statistics. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Database Management ----------------
  SELECT 'DB_MGMT',
    'In SQL, which clause is used to filter rows based on a condition?',
    'SELECT', 'WHERE', 'ORDER BY', 'GROUP BY',
    1, 'Easy',
    'WHERE filters individual rows based on a condition; SELECT picks columns, ORDER BY sorts, and GROUP BY aggregates. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DB_MGMT',
    'Which SQL JOIN returns only the rows that have matching values in both tables?',
    'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN',
    2, 'Medium',
    'INNER JOIN returns only rows with a match in both tables; the outer joins additionally keep unmatched rows from one or both sides. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DB_MGMT',
    'Normalizing a relational database primarily aims to:',
    'Increase data redundancy for faster reads',
    'Reduce data redundancy and improve data integrity',
    'Guarantee faster performance for every possible query',
    'Eliminate the need for primary keys',
    1, 'Hard',
    'Normalization organizes tables to minimize redundant data and reduce update/insert/delete anomalies, sometimes at a performance trade-off. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Data Visualization ----------------
  SELECT 'DATA_VIZ',
    'Which chart type is best suited for showing proportions of a whole?',
    'Line chart', 'Pie chart', 'Scatter plot', 'Histogram',
    1, 'Easy',
    'A pie chart is designed to show how parts contribute to a whole; the other chart types are better suited to trends, correlation, or distribution. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_VIZ',
    'A line chart is most appropriate for visualizing:',
    'Parts of a whole at a single point in time',
    'A trend over a continuous sequence such as time',
    'Correlation between two unrelated categorical variables',
    'Geographic distribution of a variable',
    1, 'Medium',
    'Line charts connect ordered points, making them well suited to showing how a value changes over time or another continuous sequence. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_VIZ',
    'Which of the following is considered a common data visualization mistake?',
    'Labeling axes clearly',
    'Using a truncated y-axis that exaggerates small differences',
    'Choosing a colorblind-friendly palette',
    'Keeping the chart simple and uncluttered',
    1, 'Hard',
    'Truncating the y-axis can visually exaggerate differences that are actually small, misleading the viewer — clear labels, accessible palettes, and simplicity are good practice, not mistakes. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Python / Programming ----------------
  SELECT 'PROGRAMMING',
    'In Python, which keyword is used to define a function?',
    'function', 'def', 'func', 'lambda-only',
    1, 'Easy',
    'Python functions are defined with the "def" keyword; "lambda" creates anonymous inline functions but is not the general-purpose keyword. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'PROGRAMMING',
    'What does the Python expression len([1, 2, 3, 4]) evaluate to?',
    '3', '4', '10', 'It raises an error',
    1, 'Medium',
    'len() returns the number of elements in the list, which is 4. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'PROGRAMMING',
    'Which Python library is most commonly used for tabular data manipulation with DataFrames?',
    'matplotlib', 'pandas', 'requests', 'flask',
    1, 'Hard',
    'pandas provides the DataFrame structure and tools for tabular data manipulation; matplotlib is for plotting, requests for HTTP calls, and flask for web apps. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Machine Learning ----------------
  SELECT 'MACHINE_LEARNING',
    'Which of the following is an example of supervised learning?',
    'Grouping unlabeled customers into clusters',
    'Predicting house prices from historical, price-labeled data',
    'Reducing the number of dimensions in a dataset',
    'Generating random noise for testing',
    1, 'Easy',
    'Supervised learning trains on labeled data (inputs paired with known outputs), such as historical prices, to predict outcomes on new data. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'MACHINE_LEARNING',
    'Overfitting in a machine learning model means:',
    'The model performs well on both training and unseen data',
    'The model performs well on training data but poorly on unseen data',
    'The model is too simple to capture any pattern',
    'The model has no trainable parameters',
    1, 'Medium',
    'Overfitting happens when a model memorizes noise/specifics of the training set rather than learning generalizable patterns, hurting performance on new data. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'MACHINE_LEARNING',
    'Which technique is commonly used to reduce overfitting in a machine learning model?',
    'Increasing model complexity indefinitely',
    'Discarding all training data',
    'Regularization (e.g. L1/L2 penalties)',
    'Using zero training epochs',
    2, 'Hard',
    'Regularization penalizes overly complex models during training, discouraging them from fitting noise and helping them generalize better. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Statistical Software ----------------
  SELECT 'STAT_SOFTWARE',
    'SPSS is primarily used for:',
    'Web development', 'Statistical analysis of data', 'Video editing', 'Network security',
    1, 'Easy',
    'SPSS (Statistical Package for the Social Sciences) is statistical analysis software, not a web, video, or security tool. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'STAT_SOFTWARE',
    'In STATA, which command is typically used to view descriptive statistics of a variable?',
    'summarize', 'plot', 'merge', 'egen only',
    0, 'Medium',
    'The "summarize" command in STATA reports descriptive statistics such as mean, standard deviation, min, and max for a variable. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'STAT_SOFTWARE',
    'What is a key advantage of syntax/command-based statistical software (like R or STATA) over a purely menu-driven tool?',
    'It requires no learning curve at all',
    'Analyses become reproducible and can be re-run automatically via saved scripts',
    'It cannot handle datasets larger than a spreadsheet',
    'It has no way to save or export results',
    1, 'Hard',
    'Saved scripts let an analyst re-run the exact same steps later or on new data, which is central to reproducible official statistics work. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Data Quality ----------------
  SELECT 'DATA_QUALITY',
    'Which of the following is a recognized dimension of data quality?',
    'File color', 'Accuracy', 'Font size', 'Screen resolution',
    1, 'Easy',
    'Accuracy is a standard data quality dimension, alongside completeness, consistency, and timeliness — the others are not data quality concepts. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_QUALITY',
    'Data "completeness" refers to:',
    'Whether all required data values are present and not missing',
    'Whether the data is encrypted at rest',
    'How fast the data loads in an application',
    'Whether the data is visually well formatted',
    0, 'Medium',
    'Completeness measures whether expected values are actually present, as opposed to missing — it has nothing to do with encryption, load speed, or formatting. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'DATA_QUALITY',
    'A dataset records an employee''s age as 250 years. This is most likely an issue of:',
    'Data completeness', 'Data accuracy / validity', 'Data timeliness', 'Data confidentiality',
    1, 'Hard',
    'A value that is physically impossible (age 250) is an accuracy/validity problem — the data present is simply wrong, not missing, stale, or a confidentiality issue. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Survey / Sampling Concepts ----------------
  SELECT 'SAMPLING',
    'Which sampling technique ensures that each member of the population has a known, non-zero probability of selection?',
    'Convenience sampling', 'Simple random sampling', 'Snowball sampling', 'Purposive sampling',
    1, 'Easy',
    'Simple random sampling gives every population member a known, non-zero chance of selection; the other methods are non-probability techniques prone to selection bias. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'SAMPLING',
    'Stratified sampling involves:',
    'Selecting only the most conveniently available respondents',
    'Dividing the population into homogeneous subgroups (strata) and sampling from each',
    'Selecting samples referred to you by earlier participants',
    'Selecting units proportional to size without forming any groups',
    1, 'Medium',
    'Stratified sampling splits the population into meaningful subgroups first, then samples within each stratum, improving precision when strata differ from one another. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'SAMPLING',
    'Which of the following is a primary source of non-sampling error in a survey?',
    'The specific random sample that happened to be drawn',
    'Respondent non-response and measurement/interviewer error',
    'The formula used to compute sample size',
    'The width of the confidence interval',
    1, 'Hard',
    'Non-sampling error arises from sources like non-response, measurement mistakes, or interviewer bias — distinct from sampling error, which comes from studying a sample instead of the whole population. [seed:diagnostic_v1]'

  UNION ALL
  -- ---------------- Official Statistics Concepts ----------------
  SELECT 'OFFICIAL_STATS',
    'Official statistics are primarily produced by:',
    'Private marketing firms only',
    'Government and other recognized statistical agencies',
    'Social media companies',
    'Individual citizens acting independently',
    1, 'Easy',
    'Official statistics are produced under the mandate of government or officially recognized statistical bodies, distinguishing them from private or informal data sources. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'OFFICIAL_STATS',
    'A key internationally recognized principle of official statistics is:',
    'Statistics may be adjusted to favor a preferred policy outcome',
    'Impartiality and objectivity in the collection, compilation, and dissemination of data',
    'Statistics should never be released publicly',
    'Only aggregate national totals may ever be published',
    1, 'Medium',
    'Professional impartiality and objectivity are core to the UN Fundamental Principles of Official Statistics, ensuring public trust in the data. [seed:diagnostic_v1]'
  UNION ALL
  SELECT 'OFFICIAL_STATS',
    'Bodies such as a National Statistical Commission primarily exist to:',
    'Regulate private companies'' advertising content',
    'Ensure the quality, coordination, and integrity of the official statistical system',
    'Manage the country''s tax collection',
    'Oversee stock market operations',
    1, 'Hard',
    'A National Statistical Commission''s role is to coordinate and safeguard the standards and integrity of official statistics across agencies, not to regulate advertising, tax, or markets. [seed:diagnostic_v1]'
) q
JOIN competencies c ON c.code = q.code;
