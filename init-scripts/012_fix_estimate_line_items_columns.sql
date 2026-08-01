-- Confirmed by directly inspecting the real production table (\d
-- estimate_line_items showed no service_type, unit_of_measure, or notes
-- columns at all): migration 008 never fully landed here either, the
-- same underlying gap as 009/010. IF NOT EXISTS makes this safe to run
-- regardless of what partial state the real database is actually in.

BEGIN;

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'other' CHECK (service_type IN (
    'roof_soft_wash', 'driveway_cleaning', 'house_wash',
    'pool_deck', 'patio', 'fence', 'gutters',
    'screen_enclosure', 'rust_removal', 'paver_cleaning',
    'window_cleaning', 'other'
  )),
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NOT NULL DEFAULT 'each' CHECK (unit_of_measure IN (
    'sq_ft', 'linear_ft', 'each', 'hours'
  )),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMIT;
