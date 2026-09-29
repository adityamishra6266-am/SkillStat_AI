-- ============================================================
-- SkillStat AI — Competency Framework Seed Data
-- ============================================================
-- Configurable starting dataset for the Official Statistical
-- System competency model. This is NOT an official government
-- standard — it is a reasonable, editable starting point that
-- matches the competency areas named in SIH PS 26101. Admins can
-- add/edit/remove rows in `competencies` and
-- `competency_requirements` later without touching application
-- code.
--
-- Run with (after 002_competency_framework.sql):
--   mysql -u root -p skillstat_ai < database/seeds/competency_seed.sql
--
-- Safe to re-run: uses INSERT ... ON DUPLICATE KEY UPDATE / IGNORE
-- so it will not create duplicate rows.
-- ============================================================

USE skillstat_ai;

-- ------------------------------------------------------------
-- Competencies
-- ------------------------------------------------------------
INSERT INTO competencies (code, name, description, category) VALUES
  ('STAT_METHODS',   'Statistical Methods',            'Descriptive and inferential statistics, hypothesis testing, estimation, and probability concepts used in official statistics.', 'Statistics'),
  ('STAT_COMPUTING',  'Statistical Computing',          'Using computational tools and scripting to perform statistical analysis on datasets.', 'Statistics'),
  ('DATA_ANALYSIS',   'Data Analysis',                  'Interpreting, summarizing, and drawing conclusions from data, including exploratory data analysis.', 'Analytics'),
  ('DATA_MGMT',       'Data Management',                'Collecting, cleaning, storing, and organizing data throughout its lifecycle.', 'Data'),
  ('DB_MGMT',         'Database Management',            'Designing, querying, and maintaining relational and non-relational databases (e.g. SQL).', 'Data'),
  ('DATA_VIZ',        'Data Visualization',             'Communicating data and findings clearly through charts, dashboards, and visual storytelling.', 'Analytics'),
  ('PROGRAMMING',     'Python / Programming',           'General-purpose programming and scripting skills, primarily in Python, for data and automation tasks.', 'Technology'),
  ('MACHINE_LEARNING','Machine Learning',               'Applying supervised/unsupervised learning techniques to statistical and administrative data.', 'Technology'),
  ('STAT_SOFTWARE',   'Statistical Software',           'Proficiency with statistical software packages such as R, SPSS, or STATA.', 'Technology'),
  ('DATA_QUALITY',    'Data Quality',                   'Assessing and improving accuracy, completeness, consistency, and reliability of data.', 'Data'),
  ('SAMPLING',        'Survey / Sampling Concepts',     'Survey design, sampling methods, stratification, and sampling error.', 'Statistics'),
  ('OFFICIAL_STATS',  'Official Statistics Concepts',   'Understanding of the official statistical system, national statistical standards, and data governance.', 'Statistics')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  category = VALUES(category);

-- ------------------------------------------------------------
-- Competency requirements by designation
-- (department = NULL -> applies across all departments)
-- required_level / weight are illustrative defaults, editable
-- later via the admin UI once built.
-- ------------------------------------------------------------

-- Statistical Assistant
INSERT INTO competency_requirements (designation, department, competency_id, required_level, weight)
SELECT 'Statistical Assistant', '', id, req, w FROM competencies
JOIN (
  SELECT 'STAT_METHODS' code, 65 req, 1.2 w UNION ALL
  SELECT 'STAT_COMPUTING', 60, 1.0 UNION ALL
  SELECT 'DATA_ANALYSIS', 60, 1.1 UNION ALL
  SELECT 'DATA_MGMT', 55, 0.9 UNION ALL
  SELECT 'DB_MGMT', 50, 0.8 UNION ALL
  SELECT 'DATA_VIZ', 50, 0.8 UNION ALL
  SELECT 'PROGRAMMING', 45, 0.7 UNION ALL
  SELECT 'DATA_QUALITY', 55, 0.9 UNION ALL
  SELECT 'SAMPLING', 60, 1.0 UNION ALL
  SELECT 'OFFICIAL_STATS', 55, 0.9
) req_map ON req_map.code = competencies.code
ON DUPLICATE KEY UPDATE required_level = VALUES(required_level), weight = VALUES(weight);

-- Statistical Officer
INSERT INTO competency_requirements (designation, department, competency_id, required_level, weight)
SELECT 'Statistical Officer', '', id, req, w FROM competencies
JOIN (
  SELECT 'STAT_METHODS' code, 80 req, 1.3 w UNION ALL
  SELECT 'STAT_COMPUTING', 75, 1.1 UNION ALL
  SELECT 'DATA_ANALYSIS', 75, 1.2 UNION ALL
  SELECT 'DATA_MGMT', 65, 0.9 UNION ALL
  SELECT 'DB_MGMT', 65, 0.9 UNION ALL
  SELECT 'DATA_VIZ', 70, 1.0 UNION ALL
  SELECT 'PROGRAMMING', 65, 0.9 UNION ALL
  SELECT 'MACHINE_LEARNING', 50, 0.6 UNION ALL
  SELECT 'STAT_SOFTWARE', 65, 0.9 UNION ALL
  SELECT 'DATA_QUALITY', 70, 1.0 UNION ALL
  SELECT 'SAMPLING', 75, 1.1 UNION ALL
  SELECT 'OFFICIAL_STATS', 70, 1.0
) req_map ON req_map.code = competencies.code
ON DUPLICATE KEY UPDATE required_level = VALUES(required_level), weight = VALUES(weight);

-- Senior Statistical Officer
INSERT INTO competency_requirements (designation, department, competency_id, required_level, weight)
SELECT 'Senior Statistical Officer', '', id, req, w FROM competencies
JOIN (
  SELECT 'STAT_METHODS' code, 88 req, 1.3 w UNION ALL
  SELECT 'STAT_COMPUTING', 82, 1.1 UNION ALL
  SELECT 'DATA_ANALYSIS', 85, 1.2 UNION ALL
  SELECT 'DATA_MGMT', 75, 0.9 UNION ALL
  SELECT 'DB_MGMT', 72, 0.9 UNION ALL
  SELECT 'DATA_VIZ', 78, 1.0 UNION ALL
  SELECT 'PROGRAMMING', 72, 0.9 UNION ALL
  SELECT 'MACHINE_LEARNING', 60, 0.7 UNION ALL
  SELECT 'STAT_SOFTWARE', 75, 1.0 UNION ALL
  SELECT 'DATA_QUALITY', 78, 1.0 UNION ALL
  SELECT 'SAMPLING', 82, 1.1 UNION ALL
  SELECT 'OFFICIAL_STATS', 80, 1.1
) req_map ON req_map.code = competencies.code
ON DUPLICATE KEY UPDATE required_level = VALUES(required_level), weight = VALUES(weight);

-- Deputy Director
INSERT INTO competency_requirements (designation, department, competency_id, required_level, weight)
SELECT 'Deputy Director', '', id, req, w FROM competencies
JOIN (
  SELECT 'STAT_METHODS' code, 90 req, 1.2 w UNION ALL
  SELECT 'DATA_ANALYSIS', 88, 1.2 UNION ALL
  SELECT 'DATA_MGMT', 80, 1.0 UNION ALL
  SELECT 'DATA_VIZ', 82, 1.0 UNION ALL
  SELECT 'DATA_QUALITY', 82, 1.0 UNION ALL
  SELECT 'SAMPLING', 85, 1.1 UNION ALL
  SELECT 'OFFICIAL_STATS', 90, 1.3
) req_map ON req_map.code = competencies.code
ON DUPLICATE KEY UPDATE required_level = VALUES(required_level), weight = VALUES(weight);

-- Data Analyst (a common alternate designation)
INSERT INTO competency_requirements (designation, department, competency_id, required_level, weight)
SELECT 'Data Analyst', '', id, req, w FROM competencies
JOIN (
  SELECT 'STAT_METHODS' code, 70 req, 1.0 w UNION ALL
  SELECT 'STAT_COMPUTING', 75, 1.1 UNION ALL
  SELECT 'DATA_ANALYSIS', 85, 1.3 UNION ALL
  SELECT 'DATA_MGMT', 70, 1.0 UNION ALL
  SELECT 'DB_MGMT', 75, 1.1 UNION ALL
  SELECT 'DATA_VIZ', 85, 1.2 UNION ALL
  SELECT 'PROGRAMMING', 80, 1.2 UNION ALL
  SELECT 'MACHINE_LEARNING', 65, 0.9 UNION ALL
  SELECT 'DATA_QUALITY', 70, 1.0
) req_map ON req_map.code = competencies.code
ON DUPLICATE KEY UPDATE required_level = VALUES(required_level), weight = VALUES(weight);

-- ------------------------------------------------------------
-- Mock learning resource catalog
-- source is explicitly labeled MOCK_INTEGRATION — see
-- ai-service/app/services/ (later checkpoint) for the interface
-- that a real iGOT/NSSTA integration would implement instead.
-- ------------------------------------------------------------
INSERT INTO learning_resources (title, competency_id, topic, difficulty, learning_type, source, description, estimated_duration, url, is_mock)
SELECT r.title, c.id, r.topic, r.difficulty, r.learning_type, 'MOCK_INTEGRATION', r.description, r.duration, r.url, 1
FROM (
  SELECT 'STAT_METHODS' code, 'Introduction to Statistical Methods' title, 'Fundamentals' topic, 'Easy' difficulty, 'Course' learning_type, 'Covers descriptive statistics, measures of central tendency, and dispersion with practical examples.' description, '4 hours' duration, NULL url UNION ALL
  SELECT 'STAT_METHODS', 'Applied Statistical Analysis', 'Inferential Statistics', 'Medium', 'Course', 'Hypothesis testing, confidence intervals, and p-values applied to real administrative datasets.', '6 hours', NULL UNION ALL
  SELECT 'STAT_METHODS', 'Advanced Inferential Techniques', 'Advanced Methods', 'Hard', 'Course', 'Regression, ANOVA, and multivariate techniques for experienced analysts.', '8 hours', NULL UNION ALL

  SELECT 'STAT_COMPUTING', 'Getting Started with Statistical Computing', 'Computing Basics', 'Easy', 'Course', 'Introduction to using computing tools for statistical calculations.', '3 hours', NULL UNION ALL
  SELECT 'STAT_COMPUTING', 'Statistical Computing with R', 'R Programming', 'Medium', 'Course', 'Hands-on statistical computing using the R language.', '6 hours', NULL UNION ALL

  SELECT 'DATA_ANALYSIS', 'Exploratory Data Analysis Basics', 'EDA', 'Easy', 'Course', 'How to explore a new dataset: summaries, distributions, and outliers.', '3 hours', NULL UNION ALL
  SELECT 'DATA_ANALYSIS', 'Applied Data Analysis for Officers', 'Applied Analysis', 'Medium', 'Course', 'Turning administrative data into actionable analysis and reports.', '5 hours', NULL UNION ALL
  SELECT 'DATA_ANALYSIS', 'Advanced Data Analysis Techniques', 'Advanced Analysis', 'Hard', 'Practice', 'Case-study driven advanced analysis exercises.', '6 hours', NULL UNION ALL

  SELECT 'DATA_MGMT', 'Data Management Fundamentals', 'Fundamentals', 'Easy', 'Course', 'Best practices for collecting, cleaning, and organizing data.', '3 hours', NULL UNION ALL
  SELECT 'DATA_MGMT', 'Data Lifecycle Management', 'Lifecycle', 'Medium', 'Article', 'Managing data from collection through archival in a statistical office.', '2 hours', NULL UNION ALL

  SELECT 'DB_MGMT', 'SQL Fundamentals', 'SQL Basics', 'Easy', 'Course', 'Core SQL: SELECT, JOIN, GROUP BY, and filtering data.', '4 hours', NULL UNION ALL
  SELECT 'DB_MGMT', 'Database Design for Statistical Systems', 'Database Design', 'Medium', 'Course', 'Normalization, schema design, and indexing for statistical databases.', '5 hours', NULL UNION ALL

  SELECT 'DATA_VIZ', 'Data Visualization Essentials', 'Chart Basics', 'Easy', 'Course', 'Choosing the right chart type and avoiding common visualization mistakes.', '2 hours', NULL UNION ALL
  SELECT 'DATA_VIZ', 'Dashboards for Decision Makers', 'Dashboards', 'Medium', 'Course', 'Designing dashboards that communicate statistics clearly to leadership.', '4 hours', NULL UNION ALL

  SELECT 'PROGRAMMING', 'Python for Beginners', 'Python Basics', 'Easy', 'Course', 'Python syntax, data types, and control flow for absolute beginners.', '5 hours', NULL UNION ALL
  SELECT 'PROGRAMMING', 'Python for Data Handling', 'Pandas & NumPy', 'Medium', 'Course', 'Using pandas and NumPy to work with tabular statistical data.', '6 hours', NULL UNION ALL

  SELECT 'MACHINE_LEARNING', 'Machine Learning Foundations', 'ML Basics', 'Medium', 'Course', 'Core ML concepts: training, testing, overfitting, and common algorithms.', '6 hours', NULL UNION ALL
  SELECT 'MACHINE_LEARNING', 'Applied ML for Official Data', 'Applied ML', 'Hard', 'Course', 'Applying classification/regression models to administrative datasets.', '8 hours', NULL UNION ALL

  SELECT 'STAT_SOFTWARE', 'Introduction to SPSS', 'SPSS', 'Easy', 'Course', 'Getting started with SPSS for statistical analysis.', '3 hours', NULL UNION ALL
  SELECT 'STAT_SOFTWARE', 'Statistical Analysis with STATA', 'STATA', 'Medium', 'Course', 'Using STATA for regression and hypothesis testing.', '5 hours', NULL UNION ALL

  SELECT 'DATA_QUALITY', 'Fundamentals of Data Quality', 'DQ Basics', 'Easy', 'Article', 'The dimensions of data quality: accuracy, completeness, consistency, timeliness.', '1.5 hours', NULL UNION ALL
  SELECT 'DATA_QUALITY', 'Data Validation and Cleaning', 'Validation', 'Medium', 'Practice', 'Hands-on exercises identifying and correcting data quality issues.', '4 hours', NULL UNION ALL

  SELECT 'SAMPLING', 'Sampling Techniques', 'Sampling', 'Medium', 'Course', 'Random, stratified, and cluster sampling explained with worked examples.', '4 hours', NULL UNION ALL
  SELECT 'SAMPLING', 'Survey Design Principles', 'Survey Design', 'Medium', 'Course', 'Designing questionnaires and survey instruments that reduce bias.', '4 hours', NULL UNION ALL

  SELECT 'OFFICIAL_STATS', 'Introduction to the Official Statistical System', 'OSS Overview', 'Easy', 'Course', 'How India''s official statistics ecosystem is organized and governed.', '2 hours', NULL UNION ALL
  SELECT 'OFFICIAL_STATS', 'National Statistical Standards', 'Standards', 'Medium', 'Article', 'Key standards and classifications used across the official statistical system.', '2 hours', NULL
) r
JOIN competencies c ON c.code = r.code
ON DUPLICATE KEY UPDATE
  topic = VALUES(topic),
  difficulty = VALUES(difficulty),
  learning_type = VALUES(learning_type),
  description = VALUES(description),
  estimated_duration = VALUES(estimated_duration),
  url = VALUES(url);
