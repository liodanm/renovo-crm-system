BEGIN;

-- estimates.status already includes 'expired' as a value, and the
-- transition into it was already fully real (EstimatesService.
-- markExpired, called both by a manual staff action and by the
-- automation cron via AutomationService.runEstimateExpiration) — but
-- the exact moment of that transition was only ever recoverable by
-- joining through estimate_status_history or automation_log. This adds
-- the direct column so a simple query can read it without that join.
-- No second expiration mechanism is introduced — markExpired is
-- extended to set this column, not duplicated.
ALTER TABLE estimates
  ADD COLUMN expired_at TIMESTAMPTZ;

COMMIT;
