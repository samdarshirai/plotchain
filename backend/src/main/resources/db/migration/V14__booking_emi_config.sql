-- Backs the Booking & EMI Policy card on Step 5 of the setup wizard (Payments & KYC): governs
-- how a plot booking's rest-amount is split into installments and when a booking counts as
-- "confirmed" for the compensation engine (land-mlm-platform-prd.md §7.3 open question #1).
-- Config-only, singleton, same shape as V9's four tables -- no PlotBooking/EMISchedule
-- transactional tables exist yet, this only stores the policy that will govern them.

CREATE TABLE booking_emi_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    emi_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    default_installment_count INTEGER NOT NULL DEFAULT 1,
    confirm_rule VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
    confirm_threshold_percent INTEGER,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_booking_emi_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_booking_emi_config_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_confirm_rule CHECK (confirm_rule IN ('AUTO_THRESHOLD','MANUAL','KYC_GATED'))
);
INSERT INTO booking_emi_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);
