-- support-tickets unit 1 (docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md,
-- Data model). One migration for the whole spec: units 2-4 only add reads/updates on these columns.
-- TIMESTAMP (not TIMESTAMPTZ) matches every other migration in this repo.

CREATE TABLE support_ticket (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    response TEXT,
    responded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_support_ticket_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))
);

CREATE INDEX idx_support_ticket_associate_id ON support_ticket(associate_id);
CREATE INDEX idx_support_ticket_status ON support_ticket(status);
