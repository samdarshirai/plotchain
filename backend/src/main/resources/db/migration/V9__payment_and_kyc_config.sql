-- Backs Step 5 of the setup wizard (Payments & KYC): payment gateway, payout bank account, KYC
-- document requirements, and withdrawal approval mode. Four singletons, same shape as V6/V7,
-- because each is configured and audited independently (master roadmap's "per-domain tables"
-- rationale). payment_config and payout_bank_account are left nullable -- they gate Go Live, so
-- "row exists" must not mean "configured". kyc_config and withdrawal_config get real NOT NULL
-- defaults -- they never block launch.

CREATE TABLE payment_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    gateway VARCHAR(32),
    credentials_encrypted TEXT,
    modes_enabled VARCHAR(64),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_payment_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_payment_config_singleton UNIQUE (singleton_guard)
);
INSERT INTO payment_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);

CREATE TABLE payout_bank_account (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    bank_name VARCHAR(120),
    account_holder VARCHAR(120),
    account_number VARCHAR(32),
    ifsc_code VARCHAR(11),
    account_type VARCHAR(16),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_payout_bank_account_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_payout_bank_account_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_payout_bank_account_type
        CHECK (account_type IS NULL OR account_type IN ('CURRENT','SAVINGS'))
);
INSERT INTO payout_bank_account (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);

CREATE TABLE kyc_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    strictness VARCHAR(8) NOT NULL DEFAULT 'STRICT',
    required_documents VARCHAR(255) NOT NULL DEFAULT 'AADHAAR,PAN,BANK_PASSBOOK',
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_kyc_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_kyc_config_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_kyc_strictness CHECK (strictness IN ('STRICT','RELAXED'))
);
INSERT INTO kyc_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);

CREATE TABLE withdrawal_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    approval_mode VARCHAR(24) NOT NULL DEFAULT 'ALWAYS_MANUAL',
    auto_approve_limit NUMERIC(14,2),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_withdrawal_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_withdrawal_config_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_approval_mode CHECK (approval_mode IN ('AUTO_UNDER_LIMIT','ALWAYS_MANUAL'))
);
INSERT INTO withdrawal_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);
