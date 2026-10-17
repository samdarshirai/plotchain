-- AdminUserService audits team-admin create/update/delete under its own ADMIN_USERS section;
-- extend the allow-list (see V28, V43) or the audit insert violates the CHECK and the whole
-- create/update/delete transaction rolls back as a 409.
ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS'
));
