-- Backs Step 2 of the setup wizard (GET/PUT /api/company/branding, logo upload/serve, and the
-- public bootstrap endpoint). Singleton table, same shape as V6's company_profile.
CREATE TABLE company_branding (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    logo_square BYTEA,
    logo_square_content_type VARCHAR(64),
    logo_wide BYTEA,
    logo_wide_content_type VARCHAR(64),
    primary_color VARCHAR(7) NOT NULL,
    secondary_color VARCHAR(7) NOT NULL,
    tagline VARCHAR(60),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_company_branding_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_company_branding_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_company_branding_primary_color CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT chk_company_branding_secondary_color CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Seeded here, not lazily created by application code, so CompanyBrandingService can always
-- assume exactly one row exists. Colors are NOT NULL (unlike company_profile's business
-- fields) because every PUT is a full replace of both, so there is no legitimate half-set
-- color state -- the seed values match _tokens.scss's :root defaults, so a fresh install's
-- brand starts in sync with the CSS before any admin touches Branding.
INSERT INTO company_branding (id, singleton_guard, primary_color, secondary_color, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, '#7C3AED', '#22D3EE', CURRENT_TIMESTAMP);
