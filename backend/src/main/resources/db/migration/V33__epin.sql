-- epin: e-PIN batch generation and redemption. epin-domain unit 1
-- (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md, Data model section).
-- Full column set is created here even though unit 1 (this migration's own unit) only ever
-- writes id/code/batch_id/status/generated_by/generated_at -- later redeem units need the
-- redemption columns to already exist and be nullable, same "build the full table shape up
-- front" convention as V22__withdrawal_request.sql's REJECTED/DISBURSED status values and
-- decided_at/disbursed_at columns.
CREATE TABLE epin (
    id UUID PRIMARY KEY,
    code VARCHAR(24) NOT NULL UNIQUE,
    batch_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    generated_by UUID NOT NULL REFERENCES associate(id),
    generated_at TIMESTAMP NOT NULL,
    redeemed_to UUID REFERENCES associate(id),
    redeemed_by UUID REFERENCES associate(id),
    redeemed_at TIMESTAMP,
    redemption_type VARCHAR(16),
    linked_entity_id UUID,
    CONSTRAINT chk_epin_status CHECK (status IN ('UNUSED','USED')),
    CONSTRAINT chk_epin_redemption_type CHECK (redemption_type IN ('ACTIVATION','TOPUP'))
);
CREATE INDEX idx_epin_batch_id ON epin(batch_id);
