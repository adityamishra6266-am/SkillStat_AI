-- ============================================================
-- SkillStat AI — Migration 004: Recommendation Engine
-- ============================================================
-- SAFE / ADDITIVE MIGRATION
--   - Builds on the `learning_resources` and `recommendations`
--     tables (created in 002_competency_framework.sql). No table is
--     dropped, redesigned, or has data removed.
--   - `recommendations.reason` is widened from VARCHAR(255) to TEXT
--     (a safe, non-lossy type change) because a dynamically-built
--     explanation sentence can run longer than 255 characters.
--   - `learning_resources.prerequisites` is a new nullable column —
--     existing rows are unaffected (they just have NULL there).
--   - A unique key is added to `recommendations` so recalculating a
--     user's recommendations updates existing rows (UPDATE) instead
--     of duplicating them (idempotent, same pattern as the earlier migrations).
--
-- Run with (after 002 + seed + 003 are already applied):
--   mysql -u root -p skillstat_ai < database/migrations/004_recommendation_engine.sql
-- ============================================================

USE skillstat_ai;

ALTER TABLE learning_resources
  ADD COLUMN prerequisites TEXT NULL
    COMMENT 'Free-text prerequisite notes for this resource, if any. NULL = none specified.'
    AFTER url;

ALTER TABLE recommendations
  MODIFY COLUMN reason TEXT NULL;

ALTER TABLE recommendations
  ADD CONSTRAINT uniq_user_competency_resource
    UNIQUE (user_id, competency_id, learning_resource_id);

-- Persists the 1st/2nd/3rd-choice ordering computed by the ranking
-- algorithm (see recommendationService.rankResourcesForGap) so that
-- reading back stored recommendations shows resources in the same
-- order they were ranked, rather than relying on implicit row order.
ALTER TABLE recommendations
  ADD COLUMN rank_order INT NOT NULL DEFAULT 1 AFTER priority;
