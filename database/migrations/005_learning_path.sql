-- ============================================================
-- SkillStat AI — Migration 005: Personalized Learning Path
-- ============================================================
-- SAFE / ADDITIVE MIGRATION
--   - Builds on the `learning_paths` and `learning_path_items`
--     tables (created in 002_competency_framework.sql). No table is
--     dropped, redesigned, or has data removed.
--   - `learning_path_items` already had a `status` enum
--     ('Locked','Available','In Progress','Completed') and
--     `completed_at` — this migration only adds the columns needed
--     to actually track progress against them: priority (for
--     display/sequencing), progress_percentage, started_at,
--     last_accessed_at, and a plain-language `reason` for why the
--     item was sequenced where it is.
--   - A unique key is added so regenerating a user's path updates
--     existing rows (preserving their progress) instead of
--     duplicating them — same idempotent pattern as the earlier migrations.
--
-- Run with (after 002 + seed + 003 + 004 + prereq seed are already
-- applied):
--   mysql -u root -p skillstat_ai < database/migrations/005_learning_path.sql
-- ============================================================

USE skillstat_ai;

ALTER TABLE learning_path_items
  ADD COLUMN priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Low' AFTER competency_id,
  ADD COLUMN progress_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER status,
  ADD COLUMN started_at TIMESTAMP NULL AFTER progress_percentage,
  ADD COLUMN last_accessed_at TIMESTAMP NULL AFTER started_at,
  ADD COLUMN reason TEXT NULL AFTER completed_at;

ALTER TABLE learning_path_items
  ADD CONSTRAINT uniq_path_competency_resource
    UNIQUE (learning_path_id, competency_id, learning_resource_id);

CREATE INDEX idx_path_items_status ON learning_path_items(status);
