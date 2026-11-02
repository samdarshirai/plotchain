-- MANAGER: back-office role with full ADMIN powers that cannot see ADMIN users.
-- Extends the role allow-list (see V4) and the audit section allow-list (see V64):
-- MANAGER account changes are audited under MANAGER_USERS so managers can see them
-- while ADMIN_USERS stays hidden from them.
ALTER TABLE associate DROP CONSTRAINT chk_associate_role;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role
    CHECK (role IN ('ADMIN','ASSOCIATE','MANAGER','SUPER_ADMIN','FINANCE','KYC_REVIEWER','SUPPORT'));

ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS', 'MASTER_PROJECTS', 'NEWS', 'EXPENSE_TYPES',
    'IMPERSONATION',
    'EXPENSE', 'ADVANCE_LOAN', 'LOAN_REPAYMENT',
    'MANAGER_USERS'
));
