-- AdminSupportTicketService audits ticket create/respond under its own section; like the KYC,
-- associate, withdrawal and wallet flows (see V28) it is not a settings-nav mutation, so extend
-- the allow-list with a dedicated value instead of reusing an existing section.
ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET'
));
