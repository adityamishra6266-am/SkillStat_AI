-- ============================================================
-- SkillStat AI — Migration 002: Competency Framework
-- ============================================================
-- SAFE / ADDITIVE MIGRATION
--   - Does NOT drop or modify any existing table's data.
--   - Only adds new tables, plus nullable/defaulted columns on
--     existing tables (users, quiz_questions).
--   - Safe to run once against an existing skillstat_ai database
--     that already has schema.sql applied.
--
-- Run with:
--   mysql -u root -p skillstat_ai < database/migrations/002_competency_framework.sql
-- ============================================================

USE skillstat_ai;

-- ------------------------------------------------------------
-- 1. Extend existing tables (additive only)
-- ------------------------------------------------------------

-- Role-based access, needed later for the admin/training-manager
-- dashboard. Defaults every existing user to 'user' so
-- nothing currently logged in breaks.
ALTER TABLE users
  ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user' AFTER password;

-- Competency/topic/difficulty/type metadata for quiz questions.
-- All nullable or defaulted so existing quiz_questions rows and the
-- existing quiz-generation code path keep working unchanged.
ALTER TABLE quiz_questions
  ADD COLUMN competency_id INT NULL AFTER quiz_id,
  ADD COLUMN topic VARCHAR(150) NULL AFTER competency_id,
  ADD COLUMN difficulty ENUM('Easy', 'Medium', 'Hard') NOT NULL DEFAULT 'Medium' AFTER topic,
  ADD COLUMN question_type ENUM('MCQ', 'MSQ', 'TrueFalse', 'Scenario') NOT NULL DEFAULT 'MCQ' AFTER difficulty;

-- ------------------------------------------------------------
-- 2. competencies
--    The master, editable list of competency areas. Nothing in
--    the app should hard-code competency names — everything reads
--    from this table.
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

-- ------------------------------------------------------------
-- 3. competency_requirements
--    What level of each competency a given designation/department
--    combination is expected to have. department = NULL means the
--    requirement applies regardless of department.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competency_requirements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  designation VARCHAR(150) NOT NULL,
  department VARCHAR(150) NOT NULL DEFAULT '' COMMENT 'Empty string = applies to all departments (NOT NULL so the unique key below can actually dedupe: MySQL treats NULL as distinct from NULL in unique indexes)',
  competency_id INT NOT NULL,
  required_level DECIMAL(5,2) NOT NULL DEFAULT 70.00 COMMENT '0-100 scale',
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT 'Relative importance for this role',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reqs_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT uniq_role_dept_competency
    UNIQUE (designation, department, competency_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. user_competencies
--    A user's current, live level for each competency they have
--    been mapped to. Updated by the mapping engine, and later by
--    quiz-performance recalculation.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_competencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  current_level DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '0-100 scale',
  source VARCHAR(50) NOT NULL DEFAULT 'mapping' COMMENT 'mapping | quiz | assessment | manual',
  last_evidence_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_competencies_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_competencies_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT uniq_user_competency
    UNIQUE (user_id, competency_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. competency_assessments
--    An audit trail: every time a competency's current_level
--    changes because of a quiz/assessment, we log before/after
--    here. This is what "Performance Analysis" and "Competency
--    Score Update" (the earlier migrations) will read from.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competency_assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  quiz_attempt_id INT DEFAULT NULL,
  score DECIMAL(5,2) NOT NULL COMMENT 'Score achieved on this competency in this event',
  previous_level DECIMAL(5,2) NOT NULL,
  new_level DECIMAL(5,2) NOT NULL,
  assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessments_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assessments_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assessments_attempt
    FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. skill_gaps
--    Cached/latest gap per user/competency (required - current),
--    with a priority bucket. Recalculated whenever competency
--    levels or requirements change; kept as a table (rather than
--    computed only on read) so the admin dashboard can aggregate
--    gaps across many users cheaply.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_gaps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  required_level DECIMAL(5,2) NOT NULL,
  current_level DECIMAL(5,2) NOT NULL,
  gap DECIMAL(5,2) NOT NULL COMMENT 'required_level - current_level, floored at 0',
  priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Low',
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gaps_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_gaps_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT uniq_user_gap
    UNIQUE (user_id, competency_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. learning_resources
--    MOCK / DEVELOPMENT INTEGRATION LAYER.
--    This is a local, clearly-labeled stand-in for iGOT Karmayogi /
--    NSSTA / TPAC content catalogs. Every row's `source` column
--    identifies it as mock data. The API surface that reads from
--    this table (see recommendation service, added in a later
--    checkpoint) is designed so it can be pointed at a real
--    iGOT/NSSTA API later without changing its callers.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  competency_id INT NOT NULL,
  topic VARCHAR(150) DEFAULT NULL,
  difficulty ENUM('Easy', 'Medium', 'Hard') NOT NULL DEFAULT 'Medium',
  learning_type VARCHAR(50) NOT NULL DEFAULT 'Course' COMMENT 'Course | Video | Article | Practice',
  source VARCHAR(100) NOT NULL DEFAULT 'MOCK_INTEGRATION',
  description TEXT,
  estimated_duration VARCHAR(50) DEFAULT NULL,
  url VARCHAR(500) DEFAULT NULL,
  is_mock TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resources_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT uniq_resource_title_competency
    UNIQUE (title, competency_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. recommendations
--    Per-user recommended resources, generated by the
--    recommendation engine (next checkpoint) from skill_gaps.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  competency_id INT NOT NULL,
  learning_resource_id INT NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Low',
  status ENUM('Pending', 'In Progress', 'Completed', 'Dismissed') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_recs_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_recs_resource
    FOREIGN KEY (learning_resource_id) REFERENCES learning_resources(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. learning_paths / learning_path_items
--    The dynamically generated, ordered sequence of resources +
--    assessments for a user, built from their current skill gaps.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_paths (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('Active', 'Completed', 'Archived') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_paths_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS learning_path_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_path_id INT NOT NULL,
  competency_id INT NOT NULL,
  learning_resource_id INT DEFAULT NULL,
  item_type ENUM('Resource', 'Assessment') NOT NULL DEFAULT 'Resource',
  sequence_order INT NOT NULL,
  status ENUM('Locked', 'Available', 'In Progress', 'Completed') NOT NULL DEFAULT 'Locked',
  completed_at TIMESTAMP NULL,
  CONSTRAINT fk_path_items_path
    FOREIGN KEY (learning_path_id) REFERENCES learning_paths(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_path_items_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_path_items_resource
    FOREIGN KEY (learning_resource_id) REFERENCES learning_resources(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Helpful indexes
-- ------------------------------------------------------------
CREATE INDEX idx_requirements_designation ON competency_requirements(designation);
CREATE INDEX idx_user_competencies_user ON user_competencies(user_id);
CREATE INDEX idx_skill_gaps_user ON skill_gaps(user_id);
CREATE INDEX idx_skill_gaps_priority ON skill_gaps(priority);
CREATE INDEX idx_resources_competency ON learning_resources(competency_id);
CREATE INDEX idx_recommendations_user ON recommendations(user_id);
CREATE INDEX idx_path_items_path ON learning_path_items(learning_path_id);
CREATE INDEX idx_assessments_user ON competency_assessments(user_id);
CREATE INDEX idx_questions_competency ON quiz_questions(competency_id);
