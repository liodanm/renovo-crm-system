-- Adds a nullable `source` column to estimates, matching the existing
-- companies/customers `source` pattern already in the schema. Needed so
-- the Quote Widget (Phase 1) can record every estimate it creates as
-- "Website Instant Quote" without repurposing an unrelated free-text
-- field. NULL for every existing estimate — staff-created estimates are
-- simply unattributed, exactly as before this migration.
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS source TEXT;
