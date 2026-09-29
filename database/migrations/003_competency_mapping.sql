-- ============================================================
-- SkillStat AI — Migration 003: Explainable Competency Mapping
-- ============================================================
-- SAFE / ADDITIVE MIGRATION
--   - Adds two explainability columns to `user_competencies`
--     (created in migration 002). No other table and no existing
--     row is touched.
--   - This is the ONLY migration that adds `reason` / `confidence`.
--     (An earlier revision of the project shipped two overlapping
--     "003" files that both tried to add these columns and the second
--     one failed with "Duplicate column name". They were merged into
--     this single file in the final integration phase.)
--
-- Columns:
--   reason     - human-readable explanation of how current_level was
--                derived (profile factors and/or assessment evidence).
--   confidence - how much evidence backs current_level:
--                Low = profile-only guess, Medium = some signal,
--                High = backed by assessment evidence.
--
-- Run AFTER 002_competency_framework.sql (+ competency_seed.sql):
--   mysql -u <user> -p skillstat_ai < database/migrations/003_competency_mapping.sql
--
-- NOTE: for a brand-new installation prefer database/final_setup.sql,
-- which already contains every migration in the right order.
-- ============================================================

USE skillstat_ai;

ALTER TABLE user_competencies
  ADD COLUMN reason TEXT NULL
    COMMENT 'Human-readable explanation of how current_level was derived (profile factors and/or assessment evidence).'
    AFTER source,
  ADD COLUMN confidence ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Low'
    COMMENT 'How much evidence backs current_level: Low = profile-only guess, Medium = some signal, High = backed by assessment evidence.'
    AFTER reason;
