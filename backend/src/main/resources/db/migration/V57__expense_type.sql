CREATE TABLE expense_type (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_expense_type_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);
CREATE UNIQUE INDEX uq_expense_type_name ON expense_type (name);

ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS', 'MASTER_PROJECTS', 'NEWS', 'EXPENSE_TYPES'
));
