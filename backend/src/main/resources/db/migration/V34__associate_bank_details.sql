-- My Account "Bank Details" tab: an associate's own payout bank details, self-service editable
-- (docs/superpowers/plans/can-you-break-down-vectorized-dongarra.md). One row per associate,
-- same FK+index shape as V19's associate_kyc_document, not V9's company-level singleton_guard
-- pattern, since this is per-associate rather than a single company-wide row.
CREATE TABLE associate_bank_details (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL UNIQUE REFERENCES associate(id),
    bank_name VARCHAR(120),
    account_holder VARCHAR(120),
    account_number VARCHAR(32),
    ifsc_code VARCHAR(11),
    account_type VARCHAR(16) CHECK (account_type IN ('CURRENT', 'SAVINGS')),
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_associate_bank_details_associate_id ON associate_bank_details(associate_id);
