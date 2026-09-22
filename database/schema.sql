-- ============================================================
-- SkillStat AI - Database Schema
-- Database: skillstat_ai
-- Target: MySQL (via XAMPP)
-- ============================================================

CREATE DATABASE IF NOT EXISTS skillstat_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE skillstat_ai;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
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
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- documents
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  extracted_text LONGTEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- quizzes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  document_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quizzes_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_quizzes_document
    FOREIGN KEY (document_id) REFERENCES documents(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- quiz_questions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  question TEXT NOT NULL,
  option_a VARCHAR(500) NOT NULL,
  option_b VARCHAR(500) NOT NULL,
  option_c VARCHAR(500) NOT NULL,
  option_d VARCHAR(500) NOT NULL,
  correct_answer TINYINT NOT NULL COMMENT '0=A, 1=B, 2=C, 3=D',
  explanation TEXT,
  CONSTRAINT fk_questions_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- quiz_attempts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  quiz_id INT NOT NULL,
  score INT NOT NULL,
  total_questions INT NOT NULL DEFAULT 5,
  percentage DECIMAL(5,2) NOT NULL,
  answers_json JSON DEFAULT NULL COMMENT 'User selected answers, keyed by question id',
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_attempts_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Helpful indexes
CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_quizzes_user ON quizzes(user_id);
CREATE INDEX idx_attempts_user ON quiz_attempts(user_id);
