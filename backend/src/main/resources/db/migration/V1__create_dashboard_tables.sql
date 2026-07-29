CREATE TABLE rank_tier (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rank_order INT NOT NULL,
    volume_threshold NUMERIC(14,2) NOT NULL,
    UNIQUE (rank_order)
);

CREATE TABLE associate (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    sponsor_id UUID,
    parent_id UUID REFERENCES associate(id),
    position VARCHAR(1) CHECK (position IN ('L','R')),
    name VARCHAR(200) NOT NULL,
    rank_id UUID NOT NULL REFERENCES rank_tier(id),
    kyc_status VARCHAR(20) NOT NULL CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    joined_at TIMESTAMP NOT NULL,
    cumulative_matched_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    last_active_at TIMESTAMP
);
CREATE INDEX idx_associate_parent_id ON associate(parent_id);
CREATE INDEX idx_associate_tenant_id ON associate(tenant_id);

CREATE TABLE cycle (
    id UUID PRIMARY KEY,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN','CALCULATING','CLOSED','PAID'))
);

CREATE TABLE ledger_entry (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    associate_id UUID NOT NULL REFERENCES associate(id),
    income_type VARCHAR(30) NOT NULL CHECK (income_type IN ('DIRECT','MATCHING','SPONSOR_MATCHING','ROYALTY','REWARD','PERK')),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    gross_amount NUMERIC(14,2) NOT NULL,
    tds_deduction NUMERIC(14,2) NOT NULL,
    admin_deduction NUMERIC(14,2) NOT NULL,
    net_amount NUMERIC(14,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','CARRIED_FORWARD','PAID','REVERSED')),
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_ledger_associate_cycle ON ledger_entry(associate_id, cycle_id);

CREATE TABLE leg_volume (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    associate_id UUID NOT NULL REFERENCES associate(id),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    left_leg_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    right_leg_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    carried_forward_left NUMERIC(14,2) NOT NULL DEFAULT 0,
    carried_forward_right NUMERIC(14,2) NOT NULL DEFAULT 0,
    UNIQUE (associate_id, cycle_id)
);

CREATE TABLE wallet (
    associate_id UUID PRIMARY KEY REFERENCES associate(id),
    balance NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE announcement (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    published_at TIMESTAMP NOT NULL,
    audience VARCHAR(50) NOT NULL DEFAULT 'ALL'
);
CREATE INDEX idx_announcement_tenant_published ON announcement(tenant_id, published_at DESC);
