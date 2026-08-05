CREATE TABLE sale (
    id UUID PRIMARY KEY,
    plot_id UUID NOT NULL REFERENCES plot(id),
    associate_id UUID NOT NULL REFERENCES associate(id),
    buyer_name VARCHAR(200) NOT NULL,
    buyer_phone VARCHAR(20) NOT NULL,
    buyer_email VARCHAR(255),
    amount NUMERIC(14,2) NOT NULL,
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    leg_credited VARCHAR(1) NOT NULL CHECK (leg_credited IN ('L','R')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('RECORDED','VOIDED')),
    void_reason VARCHAR(500),
    recorded_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_sale_associate_id ON sale(associate_id);

-- Nullable: every non-DIRECT income type that will eventually populate this column
-- (matching, sponsor, royalty, reward -- all from the still-unbuilt compensation engine)
-- doesn't exist yet. Only DIRECT ledger entries (Sales unit 3) set it, to the originating
-- sale.id.
ALTER TABLE ledger_entry ADD COLUMN source_ref UUID NULL;
