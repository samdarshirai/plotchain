-- Master Data > Projects. project (plot-holding) keeps its FKs from plot/sale and links up to
-- its master row; one master row is backfilled per existing project (same id).
CREATE TABLE master_project (
    id                      UUID PRIMARY KEY,
    name                    VARCHAR(120) NOT NULL UNIQUE,
    type                    VARCHAR(20)  NOT NULL,
    location                VARCHAR(255) NOT NULL,
    city                    VARCHAR(100) NOT NULL,
    state                   VARCHAR(100) NOT NULL,
    business_percentage     NUMERIC(5,2) NOT NULL DEFAULT 0,
    rate_per_sqft           NUMERIC(12,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    location_map            BYTEA,
    location_map_content_type VARCHAR(50),
    project_map             BYTEA,
    project_map_content_type  VARCHAR(50),
    created_at              TIMESTAMP  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMP  NOT NULL DEFAULT now(),
    CONSTRAINT chk_master_project_type CHECK (type IN ('PLOT', 'APARTMENT')),
    CONSTRAINT chk_master_project_status CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    CONSTRAINT chk_master_project_percentage CHECK (business_percentage BETWEEN 0 AND 100),
    CONSTRAINT chk_master_project_rate CHECK (rate_per_sqft >= 0)
);

INSERT INTO master_project (id, name, type, location, city, state, created_at)
SELECT id, name, 'PLOT', location, '', '', created_at FROM project;

ALTER TABLE project ADD COLUMN master_project_id UUID REFERENCES master_project(id);
UPDATE project SET master_project_id = id;

ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS', 'MASTER_PROJECTS'
));
