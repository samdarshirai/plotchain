-- Admin impersonation (start/stop) is audited under its own IMPERSONATION section;
-- extend the allow-list (see V53, V57) or the audit insert violates the CHECK and the
-- impersonation request fails.
ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS', 'MASTER_PROJECTS', 'NEWS', 'EXPENSE_TYPES',
    'IMPERSONATION'
));
