-- Read-only, append-only ledger backing GET /api/company/audit-log. Every settings-mutating
-- service inserts exactly one row via SettingsAuditService.record(...); there is deliberately
-- no UPDATE/DELETE path anywhere. section mirrors the seven settings-nav keys, not one value per
-- backend microservice: Payments & KYC's four backing tables (PaymentConfig/PayoutBankAccount/
-- KycConfig/WithdrawalConfig) all record under the single PAYMENTS_KYC value, matching the one
-- settings-nav item and filter-dropdown entry.
CREATE TABLE settings_audit_log (
    id UUID PRIMARY KEY,
    changed_by_associate_id UUID REFERENCES associate(id),
    section VARCHAR(32) NOT NULL,
    summary TEXT NOT NULL,
    detail TEXT,
    changed_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
        'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
        'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES'
    ))
);
CREATE INDEX idx_settings_audit_changed_at ON settings_audit_log(changed_at DESC);
