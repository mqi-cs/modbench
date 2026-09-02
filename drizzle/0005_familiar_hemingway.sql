-- Adds parts.asset_state for the Phase 4 preview pipeline.
--
-- Hand-written in place of drizzle-kit's generated version, which rebuilt
-- the whole table and copied `asset_state` out of the old one -- a column
-- that by definition does not exist yet, so the migration could never
-- apply to a real database. SQLite takes a column-level CHECK on ADD
-- COLUMN, so the constraint survives the simpler route.
ALTER TABLE `parts` ADD COLUMN `asset_state` text
  CHECK (`asset_state` IS NULL OR `asset_state` IN ('ready', 'needs-manual', 'unavailable'));
