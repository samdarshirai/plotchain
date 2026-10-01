-- e-PIN extension (docs/superpowers/specs/role-capability/2026-10-01-epin-blog-extension-design.md,
-- Data model). Existing associate rows keep status 'ACTIVE' (column default), so the PENDING
-- value only ever applies to associates created after AssociateProvisioningService changes.
ALTER TABLE associate DROP CONSTRAINT chk_associate_status;
ALTER TABLE associate ADD CONSTRAINT chk_associate_status
    CHECK (status IN ('ACTIVE','SUSPENDED','PENDING'));

ALTER TABLE epin DROP CONSTRAINT chk_epin_status;
ALTER TABLE epin ADD CONSTRAINT chk_epin_status
    CHECK (status IN ('UNUSED','ALLOCATED','USED','BLOCKED'));

ALTER TABLE epin ADD COLUMN expires_at TIMESTAMP;
ALTER TABLE epin ADD COLUMN allocated_to UUID REFERENCES associate(id);
ALTER TABLE epin ADD COLUMN allocated_by UUID REFERENCES associate(id);
ALTER TABLE epin ADD COLUMN allocated_at TIMESTAMP;
ALTER TABLE epin ADD COLUMN blocked_by UUID REFERENCES associate(id);
ALTER TABLE epin ADD COLUMN blocked_at TIMESTAMP;
ALTER TABLE epin ADD COLUMN block_reason VARCHAR(255);
CREATE INDEX idx_epin_allocated_to ON epin(allocated_to);

CREATE TABLE epin_event (
    id UUID PRIMARY KEY,
    epin_id UUID NOT NULL REFERENCES epin(id),
    event_type VARCHAR(16) NOT NULL,
    actor_id UUID NOT NULL REFERENCES associate(id),
    from_associate_id UUID,
    to_associate_id UUID,
    at TIMESTAMP NOT NULL,
    note VARCHAR(255),
    CONSTRAINT chk_epin_event_type CHECK (event_type IN
        ('GENERATED','ALLOCATED','TRANSFERRED','REDEEMED','BLOCKED','UNBLOCKED'))
);
CREATE INDEX idx_epin_event_epin_id ON epin_event(epin_id);
