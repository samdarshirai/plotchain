-- withdrawal_config gains the minimum-withdrawal-threshold field the PRD assumed already
-- existed (wallet-withdrawal spec, Decisions 6 and 18). Nullable, no default: unlike
-- approval_mode/auto_approve_limit (always-defaulted, never block Go-Live), this field is
-- promoted to a Go-Live-gating requirement -- an admin must explicitly set it (including to 0,
-- for an explicit "no minimum" policy) before WithdrawalConfigService.isComplete() is true.
ALTER TABLE withdrawal_config
    ADD COLUMN minimum_withdrawal_amount NUMERIC(14,2);
