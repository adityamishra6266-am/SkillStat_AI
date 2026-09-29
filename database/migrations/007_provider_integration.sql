-- ============================================================
-- SkillStat AI — Migration 007: iGOT/NSSTA Provider Integration Layer
-- ============================================================
-- SAFE / ADDITIVE MIGRATION
--   - Adds ONE new nullable column, `learning_resources.external_id`,
--     to hold a provider's own reference code for a resource (e.g.
--     'IGOT-DEMO-001', 'NSSTA-DEMO-001'). Existing rows are
--     unaffected (external_id is NULL for the pre-existing local
--     catalog rows, which have no external provider reference).
--   - Deliberately does NOT add a second "integration mode" or
--     "is_live" column: `learning_resources.is_mock` (added in
--     002_competency_framework.sql) already carries exactly that
--     meaning, so existing reuses it instead of duplicating it.
--   - Deliberately does NOT rename or repurpose `source`: it already
--     identifies where a resource comes from ('MOCK_INTEGRATION' for
--     the original local catalog). existing adds two new values used
--     going forward — 'IGOT' and 'NSSTA' — for resources synced from
--     the new mock provider adapters (see
--     backend/src/providers/). No existing row's `source` value is
--     changed by this migration.
--   - No table is dropped, redesigned, or has data removed. No
--     existing column is narrowed or made stricter.
--
-- Run with (after 002-006 + their seeds are already applied):
--   mysql -u root -p skillstat_ai < database/migrations/007_provider_integration.sql
-- ============================================================

USE skillstat_ai;

ALTER TABLE learning_resources
  ADD COLUMN external_id VARCHAR(100) NULL
    COMMENT 'Provider-native reference code for this resource (e.g. IGOT-DEMO-001). NULL for local-catalog resources with no external provider.'
    AFTER source;
