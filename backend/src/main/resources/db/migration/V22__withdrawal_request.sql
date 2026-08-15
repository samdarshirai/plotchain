-- withdrawal_request: the runtime request/approval/disbursement lifecycle. Admin submits on an
-- associate's behalf (role-capability spec: associates have no self-serve write action here).
-- Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
-- Data model section). Full four-value status check constraint is included even though unit 5
-- (this migration's own unit) only ever writes REQUESTED or APPROVED rows -- units 6-9 need
-- REJECTED/DISBURSED to already be valid values.
CREATE TABLE withdrawal_request (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    amount NUMERIC(14,2) NOT NULL,
    status VARCHAR(16) NOT NULL,
    reason VARCHAR(500),
    bank_reference VARCHAR(120),
    requested_at TIMESTAMP NOT NULL,
    decided_at TIMESTAMP,
    disbursed_at TIMESTAMP,
    CONSTRAINT chk_withdrawal_request_status
        CHECK (status IN ('REQUESTED','APPROVED','REJECTED','DISBURSED')),
    CONSTRAINT chk_withdrawal_request_amount_positive CHECK (amount > 0)
);
CREATE INDEX idx_withdrawal_request_associate ON withdrawal_request(associate_id);
CREATE INDEX idx_withdrawal_request_status ON withdrawal_request(status);
