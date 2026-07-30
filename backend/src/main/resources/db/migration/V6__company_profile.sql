-- Backs Step 1 of the setup wizard (GET/PUT /api/company/profile). Singleton table, same
-- shape as V5's setup_state: exactly one row, enforced by the database.
CREATE TABLE company_profile (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    display_name VARCHAR(255),
    legal_name VARCHAR(255),
    registration_number VARCHAR(32),
    contact_name VARCHAR(255),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    registered_address TEXT,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_company_profile_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_company_profile_singleton UNIQUE (singleton_guard)
);

-- Seeded here, not lazily created by application code, so CompanyProfileService can always
-- assume exactly one row exists. All business fields start blank; registration_number stays
-- optional per spec, the rest are required for step completeness but not NOT NULL at the
-- database level -- "complete" is a service-level predicate, filled in over time via PUT.
INSERT INTO company_profile (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);
