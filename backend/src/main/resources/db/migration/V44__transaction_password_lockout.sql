-- Brute-force protection for the transaction password (docs/superpowers/specs/2026-10-10-transaction-password-enforcement-design.md).
-- locked_until in the past means unlocked; no cleanup job.
ALTER TABLE associate ADD COLUMN transaction_password_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE associate ADD COLUMN transaction_password_locked_until TIMESTAMP;
