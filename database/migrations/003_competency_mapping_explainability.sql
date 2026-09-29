-- ============================================================
-- SkillStat AI — Migration 003: Explainable Competency Mapping
-- ============================================================
-- SAFE / ADDITIVE MIGRATION (Phase 2)
--   - Adds two nullable/defaulted columns to the existing
--     `user_competencies` table (created in migration 002).
--   - Does not touch any other table or any existing data.
--
-- Run AFTER 002_competency_framework.sql, against a database that
-- already has it applied:
--   mysql -u root -p skillstat_ai < database/migrations/003_competency_mapping_explainability.sql
-- ============================================================

USE skillstat_ai;

ALTER TABLE user_competencies
  ADD COLUMN reason TEXT NULL
    COMMENT 'Human-readable explanation of how current_level was derived (profile factors and/or quiz evidence).'
    AFTER source,
  ADD COLUMN confidence ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Low'
    COMMENT 'How much evidence backs current_level: Low = profile-only guess, Medium = some signal, High = backed by quiz evidence.'
    AFTER reason;
