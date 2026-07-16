-- Found by testing convertToJob() against a real database before shipping
-- it: the existing jobs.status CHECK constraint only allowed
-- ('scheduled','in_progress','completed','cancelled','on_hold') — it would
-- have rejected every single estimate-to-job conversion. A NULL
-- scheduled_start already naturally keeps a job off the dashboard
-- calendar (DashboardService.getCalendar filters scheduledStart into a
-- date range, which NULL never matches) regardless of status — but
-- leaving status='scheduled' on a job with no date at all is misleading
-- to anyone querying jobs directly. 'unscheduled' is the honest value.

BEGIN;

ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('unscheduled', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold'));

COMMIT;
