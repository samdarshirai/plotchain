-- Admin-imposed suspension (login-access gate), distinct from the date-range-computed
-- "active/inactive" business-activity concept already served by
-- AssociateRepository.countActiveToday against last_active_at.
ALTER TABLE associate ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE associate ADD CONSTRAINT chk_associate_status CHECK (status IN ('ACTIVE','SUSPENDED'));
