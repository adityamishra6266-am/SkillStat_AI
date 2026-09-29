-- ============================================================
-- SkillStat AI — Migration 006: AI-Assisted Diagnostic Assessment
-- ============================================================
-- SAFE / ADDITIVE MIGRATION
--   - Widens `quizzes.document_id` to be nullable so a diagnostic
--     assessment (which is not generated from an uploaded document)
--     can be stored as an ordinary row in the EXISTING `quizzes` /
--     `quiz_questions` / `quiz_attempts` tables instead of a second,
--     competing set of tables. This is a widening change (NOT NULL ->
--     NULL): every existing row already has a non-null document_id,
--     so no existing data is affected and no existing query that
--     filters/joins on document_id changes behaviour for those rows.
--   - Adds `quizzes.quiz_type` ('Standard' | 'Diagnostic'), defaulted
--     to 'Standard' so every existing row is classified exactly as it
--     already behaves today. This is the ONE place that distinguishes
--     a diagnostic assessment from a document-based quiz; nothing else
--     needs a parallel concept of "assessment_type".
--   - Adds a NEW table, `diagnostic_questions`: a competency-tagged
--     question bank the diagnostic assessment draws from. This is
--     intentionally separate from `quiz_questions` (which stores the
--     questions belonging to one specific quiz attempt/document) —
--     `diagnostic_questions` is the reusable POOL; when a user starts
--     a diagnostic assessment, a selection of rows from this pool is
--     COPIED into `quiz_questions` under a new `quizzes` row (see
--     diagnosticAssessmentService.js). This means the existing
--     the earlier migrations scoring pipeline (which reads quiz_questions +
--     quiz_attempts) needs ZERO changes to support diagnostic
--     assessments — it already works on any quiz_id with
--     competency-tagged questions.
--   - No table is dropped, redesigned, or has data removed. No
--     existing column is narrowed or made stricter.
--
-- Run with (after 002-005 + their seeds are already applied):
--   mysql -u root -p skillstat_ai < database/migrations/006_diagnostic_assessment.sql
-- ============================================================

USE skillstat_ai;

-- ------------------------------------------------------------
-- 1. Allow a quiz to exist without a source document.
-- ------------------------------------------------------------
ALTER TABLE quizzes
  MODIFY COLUMN document_id INT NULL;

ALTER TABLE quizzes
  ADD COLUMN quiz_type ENUM('Standard', 'Diagnostic') NOT NULL DEFAULT 'Standard' AFTER document_id;

CREATE INDEX idx_quizzes_type ON quizzes(quiz_type);

-- ------------------------------------------------------------
-- 2. diagnostic_questions
--    The reusable, competency-tagged diagnostic question bank.
--    Mirrors the shape of quiz_questions (same option/correct-answer
--    convention) so copying a row across is a straight field mapping.
--    is_active lets an admin retire a question without deleting the
--    audit trail of any assessment that already used it.
-- ------------------------------------------------------------
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
  CONSTRAINT fk_diagnostic_questions_competency
    FOREIGN KEY (competency_id) REFERENCES competencies(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_diagnostic_questions_competency ON diagnostic_questions(competency_id);
CREATE INDEX idx_diagnostic_questions_active ON diagnostic_questions(is_active);
