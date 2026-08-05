-- Review Tracking — genuinely the smallest possible implementation.
-- No Google Business Profile integration exists anywhere in this
-- codebase (confirmed by direct search), so automated review-completion
-- detection isn't possible today. "Request Sent" is already fully
-- derivable from the existing automation_logs table (ruleType =
-- 'review_request') — no new storage needed for that half at all. This
-- single nullable timestamp is the only new thing genuinely required,
-- matching the same "did this happen, and when" convention already used
-- by estimates.accepted_at and jobs.actual_end, not a new pattern.
ALTER TABLE customers ADD COLUMN review_received_at TIMESTAMPTZ;
