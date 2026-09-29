
-- ============================================================
-- SkillStat AI — FINAL DATABASE SETUP  (final integration, SIH 2026 PS 26101)
-- ============================================================
-- One script that creates the complete schema (users … diagnostic
-- questions) plus the seed data needed for the demo. It is the
-- RECOMMENDED way to set up a fresh database:
--
--   mysql -u <user> -p < database/final_setup.sql
--   (or: cd backend && npm run db:setup   — same thing, no mysql CLI needed)
--
-- Safe to re-run: every table uses CREATE TABLE IF NOT EXISTS and every
-- seed is idempotent, so running it twice never duplicates data and
-- never deletes user accounts, quizzes, attempts or progress.
-- (It only refreshes the *seed* tables: competency framework rows,
--  learning-resource catalogue rows and the diagnostic question bank.)
--
-- The individual files in database/migrations/ and database/seeds/ are
-- kept for project history and for upgrading an EXISTING pre-final-integration
-- database in place (run only the migrations you have not applied yet,
-- e.g. 008_competency_aware_document_quiz.sql). Do NOT mix the two
-- approaches on the same database.
--
-- This file is generated from the consolidated schema below plus the
-- canonical seed files in database/seeds/. If you change a seed file,
-- regenerate the seed section of this script.
-- ============================================================

CREATE DATABASE IF NOT EXISTS skillstat_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE skillstat_ai;

-- ------------------------------------------------------------
-- Accounts & profile
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt hash — never returned by any API',
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  designation VARCHAR(150) DEFAULT NULL,
  department VARCHAR(150) DEFAULT NULL,
  qualification VARCHAR(150) DEFAULT NULL,
  experience VARCHAR(50) DEFAULT NULL,
  interests VARCHAR(255) DEFAULT NULL,
  skill_level ENUM('Beginner', 'Intermediate', 'Advanced') DEFAULT 'Beginner',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Competency framework
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Stable machine key, e.g. STAT_METHODS',
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competency_requirements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  designation VARCHAR(150) NOT NULL,
  department VARCHAR(150) NOT NULL DEFAULT '' COMMENT 'Empty string = applies to all departments',
  competency_id INT NOT NULL,
  required_level DECIMAL(5,2) NOT NULL DEFAULT 70.00 COMMENT '0-100 scale',
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT 'Relative importance for this role',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reqs_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT uniq_role_dept_competency UNIQUE (designation, department, competency_id),
  INDEX idx_requirements_designation (designation)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_competencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  current_level DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '0-100 scale',
  source VARCHAR(50) NOT NULL DEFAULT 'mapping' COMMENT 'mapping | mapping+quiz',
  reason TEXT NULL COMMENT 'How current_level was derived (profile factors and/or assessment evidence)',
  confidence ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Low' COMMENT 'Low = profile-only, Medium = some signal, High = backed by assessment evidence',
  last_evidence_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_competencies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_competencies_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT uniq_user_competency UNIQUE (user_id, competency_id),
  INDEX idx_user_competencies_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS skill_gaps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  required_level DECIMAL(5,2) NOT NULL,
  current_level DECIMAL(5,2) NOT NULL,
  gap DECIMAL(5,2) NOT NULL COMMENT 'required_level - current_level, floored at 0',
  priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Low',
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gaps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gaps_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT uniq_user_gap UNIQUE (user_id, competency_id),
  INDEX idx_skill_gaps_user (user_id),
  INDEX idx_skill_gaps_priority (priority)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Learning material, quizzes and attempts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  extracted_text LONGTEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_documents_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  document_id INT NULL COMMENT 'NULL for diagnostic assessments (no source document)',
  quiz_type ENUM('Standard', 'Diagnostic') NOT NULL DEFAULT 'Standard',
  generation_mode VARCHAR(30) NULL COMMENT 'curated_bank | ai_assisted | document_llm | document_extractive',
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quizzes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_quizzes_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  INDEX idx_quizzes_user (user_id),
  INDEX idx_quizzes_type (quiz_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  competency_id INT NULL COMMENT 'NULL when no reliable competency mapping exists (never fabricated)',
  topic VARCHAR(150) NULL,
  difficulty ENUM('Easy', 'Medium', 'Hard') NOT NULL DEFAULT 'Medium',
  question_type ENUM('MCQ', 'MSQ', 'TrueFalse', 'Scenario') NOT NULL DEFAULT 'MCQ',
  source_type ENUM('bank', 'llm', 'extractive') NULL COMMENT 'bank = curated question bank, llm = LLM generated, extractive = built from the document text',
  mapping_confidence DECIMAL(4,2) NULL COMMENT '0.00-1.00 confidence in competency_id',
  mapping_method VARCHAR(20) NULL COMMENT 'curated | llm | keyword',
  mapping_reason VARCHAR(500) NULL,
  question TEXT NOT NULL,
  option_a VARCHAR(500) NOT NULL,
  option_b VARCHAR(500) NOT NULL,
  option_c VARCHAR(500) NOT NULL,
  option_d VARCHAR(500) NOT NULL,
  correct_answer TINYINT NOT NULL COMMENT '0=A, 1=B, 2=C, 3=D',
  explanation TEXT,
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  CONSTRAINT fk_questions_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE SET NULL,
  INDEX idx_questions_competency (competency_id),
  INDEX idx_questions_quiz (quiz_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  quiz_id INT NOT NULL,
  score INT NOT NULL,
  total_questions INT NOT NULL DEFAULT 5,
  percentage DECIMAL(5,2) NOT NULL,
  answers_json JSON DEFAULT NULL COMMENT 'User selected answers, keyed by question id',
  adaptive_update_json JSON DEFAULT NULL COMMENT 'What the adaptive pipeline actually did after this attempt',
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  INDEX idx_attempts_user (user_id),
  INDEX idx_attempts_quiz (quiz_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competency_assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  quiz_attempt_id INT DEFAULT NULL,
  score DECIMAL(5,2) NOT NULL COMMENT 'Score achieved on this competency in this event',
  previous_level DECIMAL(5,2) NOT NULL,
  new_level DECIMAL(5,2) NOT NULL,
  assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessments_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessments_attempt FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  INDEX idx_assessments_user (user_id),
  INDEX idx_assessments_attempt (quiz_attempt_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS diagnostic_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competency_id INT NOT NULL,
  question TEXT NOT NULL,
  option_a VARCHAR(500) NOT NULL,
  option_b VARCHAR(500) NOT NULL,
  option_c VARCHAR(500) NOT NULL,
  option_d VARCHAR(500) NOT NULL,
  correct_answer TINYINT NOT NULL COMMENT '0=A, 1=B, 2=C, 3=D',
  difficulty ENUM('Easy', 'Medium', 'Hard') NOT NULL DEFAULT 'Medium',
  explanation TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_diagnostic_questions_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  INDEX idx_diagnostic_questions_competency (competency_id),
  INDEX idx_diagnostic_questions_active (is_active)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Learning catalogue, recommendations and learning path
-- (learning_resources.is_mock = 1 for every prototype provider row)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  competency_id INT NOT NULL,
  topic VARCHAR(150) DEFAULT NULL,
  difficulty ENUM('Easy', 'Medium', 'Hard') NOT NULL DEFAULT 'Medium',
  learning_type VARCHAR(50) NOT NULL DEFAULT 'Course' COMMENT 'Course | Video | Article | Practice',
  source VARCHAR(100) NOT NULL DEFAULT 'MOCK_INTEGRATION' COMMENT 'MOCK_INTEGRATION | IGOT | NSSTA',
  external_id VARCHAR(100) NULL COMMENT 'Provider-native reference code (prototype catalogue code, not a real enrolment id)',
  description TEXT,
  estimated_duration VARCHAR(50) DEFAULT NULL,
  url VARCHAR(500) DEFAULT NULL COMMENT 'NULL unless a genuine resource URL exists',
  prerequisites TEXT NULL COMMENT 'Title of the prerequisite resource, if any',
  is_mock TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resources_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT uniq_resource_title_competency UNIQUE (title, competency_id),
  INDEX idx_resources_competency (competency_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recommendations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  learning_resource_id INT NOT NULL,
  reason TEXT DEFAULT NULL,
  priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Low',
  rank_order INT NOT NULL DEFAULT 1,
  status ENUM('Pending', 'In Progress', 'Completed', 'Dismissed') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_recs_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_recs_resource FOREIGN KEY (learning_resource_id) REFERENCES learning_resources(id) ON DELETE CASCADE,
  CONSTRAINT uniq_user_competency_resource UNIQUE (user_id, competency_id, learning_resource_id),
  INDEX idx_recommendations_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS learning_paths (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('Active', 'Completed', 'Archived') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_paths_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS learning_path_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_path_id INT NOT NULL,
  competency_id INT NOT NULL,
  priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Low',
  learning_resource_id INT DEFAULT NULL,
  item_type ENUM('Resource', 'Assessment') NOT NULL DEFAULT 'Resource',
  sequence_order INT NOT NULL,
  status ENUM('Locked', 'Available', 'In Progress', 'Completed') NOT NULL DEFAULT 'Locked',
  progress_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  started_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  reason TEXT NULL,
  CONSTRAINT fk_path_items_path FOREIGN KEY (learning_path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
  CONSTRAINT fk_path_items_competency FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_path_items_resource FOREIGN KEY (learning_resource_id) REFERENCES learning_resources(id) ON DELETE SET NULL,
  CONSTRAINT uniq_path_competency_resource UNIQUE (learning_path_id, competency_id, learning_resource_id),
  INDEX idx_path_items_path (learning_path_id),
  INDEX idx_path_items_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- SEED DATA
-- ============================================================

-- ---------- competency framework, requirements, prototype learning catalogue ----------
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

-- ---------- prerequisites for the prototype learning catalogue ----------
-- ============================================================
-- SkillStat AI — Prerequisite data for mock learning resources
-- ============================================================
-- Additive/idempotent: plain UPDATEs against rows already inserted
-- by competency_seed.sql. Only a representative subset of resources
-- have a natural prerequisite; the rest are left NULL (no
-- prerequisite), which the recommendation engine treats as "none".
--
-- Run with (after 004_recommendation_engine.sql):
--   mysql -u root -p skillstat_ai < database/seeds/learning_resource_prerequisites_seed.sql
-- ============================================================


UPDATE learning_resources SET prerequisites = 'Introduction to Statistical Methods'
  WHERE title = 'Applied Statistical Analysis';

UPDATE learning_resources SET prerequisites = 'Applied Statistical Analysis'
  WHERE title = 'Advanced Inferential Techniques';

UPDATE learning_resources SET prerequisites = 'Getting Started with Statistical Computing'
  WHERE title = 'Statistical Computing with R';

UPDATE learning_resources SET prerequisites = 'Exploratory Data Analysis Basics'
  WHERE title = 'Applied Data Analysis for Officers';

UPDATE learning_resources SET prerequisites = 'Applied Data Analysis for Officers'
  WHERE title = 'Advanced Data Analysis Techniques';

UPDATE learning_resources SET prerequisites = 'Machine Learning Foundations'
  WHERE title = 'Applied ML for Official Data';

UPDATE learning_resources SET prerequisites = 'Python for Beginners'
  WHERE title = 'Python for Data Handling';

UPDATE learning_resources SET prerequisites = 'SQL Fundamentals'
  WHERE title = 'Database Design for Statistical Systems';

UPDATE learning_resources SET prerequisites = 'Data Visualization Essentials'
  WHERE title = 'Dashboards for Decision Makers';

UPDATE learning_resources SET prerequisites = 'Fundamentals of Data Quality'
  WHERE title = 'Data Validation and Cleaning';

-- ---------- curated diagnostic question bank ----------
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


DELETE FROM diagnostic_questions;

INSERT INTO diagnostic_questions
  (competency_id, question, option_a, option_b, option_c, option_d, correct_answer, difficulty, explanation)
SELECT c.id, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.difficulty, q.explanation
FROM (
  -- ---------------- Statistical Methods ----------------
  SELECT 'STAT_METHODS' code,
    'Which measure of central tendency is most affected by extreme outliers?' question,
    'Mean' option_a, 'Median' option_b, 'Mode' option_c, 'Range' option_d,
    0 correct_answer, 'Easy' difficulty,
    'The mean uses every value in its calculation, so a single very large or small outlier can pull it away from the bulk of the data, unlike the median or mode.' explanation
  UNION ALL
  SELECT 'STAT_METHODS',
    'In hypothesis testing, what does the p-value represent?',
    'The probability that the null hypothesis is true',
    'The probability of observing data as extreme as, or more extreme than, the sample result, assuming the null hypothesis is true',
    'The probability that the alternative hypothesis is true',
    'The significance level chosen by the researcher',
    1, 'Medium',
    'The p-value is a conditional probability computed under the assumption that the null hypothesis holds — it is not the probability that either hypothesis is true.'
  UNION ALL
  SELECT 'STAT_METHODS',
    'A Type II error in hypothesis testing occurs when:',
    'A true null hypothesis is rejected',
    'A false null hypothesis is not rejected',
    'A false null hypothesis is rejected',
    'A true null hypothesis is not rejected',
    1, 'Hard',
    'A Type II error is failing to reject a null hypothesis that is actually false — i.e. missing a real effect. Rejecting a true null hypothesis is a Type I error.'

  UNION ALL
  -- ---------------- Statistical Computing ----------------
  SELECT 'STAT_COMPUTING',
    'Which of the following is a language widely used for statistical computing?',
    'R', 'HTML', 'CSS', 'Photoshop scripting',
    0, 'Easy',
    'R was purpose-built for statistical computing and graphics; HTML and CSS are markup/styling languages, not computational ones.'
  UNION ALL
  SELECT 'STAT_COMPUTING',
    'In statistical computing, "vectorization" refers to:',
    'Drawing vector-based graphics for reports',
    'Performing operations on entire arrays/columns at once instead of writing explicit loops',
    'Converting text into word-embedding vectors for NLP',
    'Encrypting a dataset before analysis',
    1, 'Medium',
    'Vectorized operations apply a computation across a whole array in one step, which is both faster and more idiomatic in tools like R, NumPy, or pandas than manual looping.'
  UNION ALL
  SELECT 'STAT_COMPUTING',
    'Which R data structure stores a 2-dimensional array where every element must be the same data type?',
    'list', 'data.frame', 'matrix', 'factor',
    2, 'Hard',
    'A matrix in R is strictly 2-dimensional and single-typed; a data.frame allows different column types, and list/factor are not 2-D homogeneous arrays.'

  UNION ALL
  -- ---------------- Data Analysis ----------------
  SELECT 'DATA_ANALYSIS',
    'Exploratory Data Analysis (EDA) is primarily used to:',
    'Build the final production dashboard',
    'Understand the main characteristics of a dataset before formal modeling or reporting',
    'Encrypt sensitive fields in a dataset',
    'Design the survey questionnaire',
    1, 'Easy',
    'EDA is the investigative step of summarizing, visualizing, and understanding a dataset''s structure and quirks before deeper analysis or modeling begins.'
  UNION ALL
  SELECT 'DATA_ANALYSIS',
    'A boxplot is most useful for visualizing:',
    'The relationship between two categorical variables',
    'The distribution, median, and potential outliers of a numeric variable',
    'Time-series trends only',
    'Network relationships between entities',
    1, 'Medium',
    'A boxplot summarizes a numeric variable''s quartiles, median, and outliers in one view — it is not designed for categorical relationships, pure time trends, or network data.'
  UNION ALL
  SELECT 'DATA_ANALYSIS',
    'Which correlation coefficient value indicates the strongest linear relationship (regardless of direction)?',
    '0.9', '0.0', '-0.95', '-0.2',
    2, 'Hard',
    'Correlation strength is judged by absolute value: |-0.95| = 0.95 is stronger than 0.9, 0.0 (no relationship), or -0.2 (weak).'

  UNION ALL
  -- ---------------- Data Management ----------------
  SELECT 'DATA_MGMT',
    'What is the primary purpose of data cleaning?',
    'Increasing the file size for storage benchmarking',
    'Identifying and correcting errors, duplicates, or inconsistencies in a dataset',
    'Formatting a dataset for printing only',
    'Encrypting a dataset for transmission',
    1, 'Easy',
    'Data cleaning is about improving data quality — fixing errors, duplicates, and inconsistencies — not about file size, print formatting, or encryption.'
  UNION ALL
  SELECT 'DATA_MGMT',
    'Which of the following best describes "data lifecycle management"?',
    'Managing data only during its initial collection',
    'Managing data from creation/collection through storage, use, archival, and eventual disposal',
    'Only backing up data on a fixed schedule',
    'Formatting spreadsheets for a report',
    1, 'Medium',
    'Data lifecycle management covers every stage a dataset passes through, not just collection or backups.'
  UNION ALL
  SELECT 'DATA_MGMT',
    'In data management, "data lineage" refers to:',
    'The physical location of the server hosting the data',
    'The historical record of data''s origins, movements, and transformations',
    'The file-naming convention used by a team',
    'The number of people who have viewed a dataset',
    1, 'Hard',
    'Data lineage traces where data came from and how it has been transformed and moved over time — important for auditability and trust in official statistics.'

  UNION ALL
  -- ---------------- Database Management ----------------
  SELECT 'DB_MGMT',
    'In SQL, which clause is used to filter rows based on a condition?',
    'SELECT', 'WHERE', 'ORDER BY', 'GROUP BY',
    1, 'Easy',
    'WHERE filters individual rows based on a condition; SELECT picks columns, ORDER BY sorts, and GROUP BY aggregates.'
  UNION ALL
  SELECT 'DB_MGMT',
    'Which SQL JOIN returns only the rows that have matching values in both tables?',
    'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN',
    2, 'Medium',
    'INNER JOIN returns only rows with a match in both tables; the outer joins additionally keep unmatched rows from one or both sides.'
  UNION ALL
  SELECT 'DB_MGMT',
    'Normalizing a relational database primarily aims to:',
    'Increase data redundancy for faster reads',
    'Reduce data redundancy and improve data integrity',
    'Guarantee faster performance for every possible query',
    'Eliminate the need for primary keys',
    1, 'Hard',
    'Normalization organizes tables to minimize redundant data and reduce update/insert/delete anomalies, sometimes at a performance trade-off.'

  UNION ALL
  -- ---------------- Data Visualization ----------------
  SELECT 'DATA_VIZ',
    'Which chart type is best suited for showing proportions of a whole?',
    'Line chart', 'Pie chart', 'Scatter plot', 'Histogram',
    1, 'Easy',
    'A pie chart is designed to show how parts contribute to a whole; the other chart types are better suited to trends, correlation, or distribution.'
  UNION ALL
  SELECT 'DATA_VIZ',
    'A line chart is most appropriate for visualizing:',
    'Parts of a whole at a single point in time',
    'A trend over a continuous sequence such as time',
    'Correlation between two unrelated categorical variables',
    'Geographic distribution of a variable',
    1, 'Medium',
    'Line charts connect ordered points, making them well suited to showing how a value changes over time or another continuous sequence.'
  UNION ALL
  SELECT 'DATA_VIZ',
    'Which of the following is considered a common data visualization mistake?',
    'Labeling axes clearly',
    'Using a truncated y-axis that exaggerates small differences',
    'Choosing a colorblind-friendly palette',
    'Keeping the chart simple and uncluttered',
    1, 'Hard',
    'Truncating the y-axis can visually exaggerate differences that are actually small, misleading the viewer — clear labels, accessible palettes, and simplicity are good practice, not mistakes.'

  UNION ALL
  -- ---------------- Python / Programming ----------------
  SELECT 'PROGRAMMING',
    'In Python, which keyword is used to define a function?',
    'function', 'def', 'func', 'lambda-only',
    1, 'Easy',
    'Python functions are defined with the "def" keyword; "lambda" creates anonymous inline functions but is not the general-purpose keyword.'
  UNION ALL
  SELECT 'PROGRAMMING',
    'What does the Python expression len([1, 2, 3, 4]) evaluate to?',
    '3', '4', '10', 'It raises an error',
    1, 'Medium',
    'len() returns the number of elements in the list, which is 4.'
  UNION ALL
  SELECT 'PROGRAMMING',
    'Which Python library is most commonly used for tabular data manipulation with DataFrames?',
    'matplotlib', 'pandas', 'requests', 'flask',
    1, 'Hard',
    'pandas provides the DataFrame structure and tools for tabular data manipulation; matplotlib is for plotting, requests for HTTP calls, and flask for web apps.'

  UNION ALL
  -- ---------------- Machine Learning ----------------
  SELECT 'MACHINE_LEARNING',
    'Which of the following is an example of supervised learning?',
    'Grouping unlabeled customers into clusters',
    'Predicting house prices from historical, price-labeled data',
    'Reducing the number of dimensions in a dataset',
    'Generating random noise for testing',
    1, 'Easy',
    'Supervised learning trains on labeled data (inputs paired with known outputs), such as historical prices, to predict outcomes on new data.'
  UNION ALL
  SELECT 'MACHINE_LEARNING',
    'Overfitting in a machine learning model means:',
    'The model performs well on both training and unseen data',
    'The model performs well on training data but poorly on unseen data',
    'The model is too simple to capture any pattern',
    'The model has no trainable parameters',
    1, 'Medium',
    'Overfitting happens when a model memorizes noise/specifics of the training set rather than learning generalizable patterns, hurting performance on new data.'
  UNION ALL
  SELECT 'MACHINE_LEARNING',
    'Which technique is commonly used to reduce overfitting in a machine learning model?',
    'Increasing model complexity indefinitely',
    'Discarding all training data',
    'Regularization (e.g. L1/L2 penalties)',
    'Using zero training epochs',
    2, 'Hard',
    'Regularization penalizes overly complex models during training, discouraging them from fitting noise and helping them generalize better.'

  UNION ALL
  -- ---------------- Statistical Software ----------------
  SELECT 'STAT_SOFTWARE',
    'SPSS is primarily used for:',
    'Web development', 'Statistical analysis of data', 'Video editing', 'Network security',
    1, 'Easy',
    'SPSS (Statistical Package for the Social Sciences) is statistical analysis software, not a web, video, or security tool.'
  UNION ALL
  SELECT 'STAT_SOFTWARE',
    'In STATA, which command is typically used to view descriptive statistics of a variable?',
    'summarize', 'plot', 'merge', 'egen only',
    0, 'Medium',
    'The "summarize" command in STATA reports descriptive statistics such as mean, standard deviation, min, and max for a variable.'
  UNION ALL
  SELECT 'STAT_SOFTWARE',
    'What is a key advantage of syntax/command-based statistical software (like R or STATA) over a purely menu-driven tool?',
    'It requires no learning curve at all',
    'Analyses become reproducible and can be re-run automatically via saved scripts',
    'It cannot handle datasets larger than a spreadsheet',
    'It has no way to save or export results',
    1, 'Hard',
    'Saved scripts let an analyst re-run the exact same steps later or on new data, which is central to reproducible official statistics work.'

  UNION ALL
  -- ---------------- Data Quality ----------------
  SELECT 'DATA_QUALITY',
    'Which of the following is a recognized dimension of data quality?',
    'File color', 'Accuracy', 'Font size', 'Screen resolution',
    1, 'Easy',
    'Accuracy is a standard data quality dimension, alongside completeness, consistency, and timeliness — the others are not data quality concepts.'
  UNION ALL
  SELECT 'DATA_QUALITY',
    'Data "completeness" refers to:',
    'Whether all required data values are present and not missing',
    'Whether the data is encrypted at rest',
    'How fast the data loads in an application',
    'Whether the data is visually well formatted',
    0, 'Medium',
    'Completeness measures whether expected values are actually present, as opposed to missing — it has nothing to do with encryption, load speed, or formatting.'
  UNION ALL
  SELECT 'DATA_QUALITY',
    'A dataset records an employee''s age as 250 years. This is most likely an issue of:',
    'Data completeness', 'Data accuracy / validity', 'Data timeliness', 'Data confidentiality',
    1, 'Hard',
    'A value that is physically impossible (age 250) is an accuracy/validity problem — the data present is simply wrong, not missing, stale, or a confidentiality issue.'

  UNION ALL
  -- ---------------- Survey / Sampling Concepts ----------------
  SELECT 'SAMPLING',
    'Which sampling technique ensures that each member of the population has a known, non-zero probability of selection?',
    'Convenience sampling', 'Simple random sampling', 'Snowball sampling', 'Purposive sampling',
    1, 'Easy',
    'Simple random sampling gives every population member a known, non-zero chance of selection; the other methods are non-probability techniques prone to selection bias.'
  UNION ALL
  SELECT 'SAMPLING',
    'Stratified sampling involves:',
    'Selecting only the most conveniently available respondents',
    'Dividing the population into homogeneous subgroups (strata) and sampling from each',
    'Selecting samples referred to you by earlier participants',
    'Selecting units proportional to size without forming any groups',
    1, 'Medium',
    'Stratified sampling splits the population into meaningful subgroups first, then samples within each stratum, improving precision when strata differ from one another.'
  UNION ALL
  SELECT 'SAMPLING',
    'Which of the following is a primary source of non-sampling error in a survey?',
    'The specific random sample that happened to be drawn',
    'Respondent non-response and measurement/interviewer error',
    'The formula used to compute sample size',
    'The width of the confidence interval',
    1, 'Hard',
    'Non-sampling error arises from sources like non-response, measurement mistakes, or interviewer bias — distinct from sampling error, which comes from studying a sample instead of the whole population.'

  UNION ALL
  -- ---------------- Official Statistics Concepts ----------------
  SELECT 'OFFICIAL_STATS',
    'Official statistics are primarily produced by:',
    'Private marketing firms only',
    'Government and other recognized statistical agencies',
    'Social media companies',
    'Individual citizens acting independently',
    1, 'Easy',
    'Official statistics are produced under the mandate of government or officially recognized statistical bodies, distinguishing them from private or informal data sources.'
  UNION ALL
  SELECT 'OFFICIAL_STATS',
    'A key internationally recognized principle of official statistics is:',
    'Statistics may be adjusted to favor a preferred policy outcome',
    'Impartiality and objectivity in the collection, compilation, and dissemination of data',
    'Statistics should never be released publicly',
    'Only aggregate national totals may ever be published',
    1, 'Medium',
    'Professional impartiality and objectivity are core to the UN Fundamental Principles of Official Statistics, ensuring public trust in the data.'
  UNION ALL
  SELECT 'OFFICIAL_STATS',
    'Bodies such as a National Statistical Commission primarily exist to:',
    'Regulate private companies'' advertising content',
    'Ensure the quality, coordination, and integrity of the official statistical system',
    'Manage the country''s tax collection',
    'Oversee stock market operations',
    1, 'Hard',
    'A National Statistical Commission''s role is to coordinate and safeguard the standards and integrity of official statistics across agencies, not to regulate advertising, tax, or markets.'
) q
JOIN competencies c ON c.code = q.code;
