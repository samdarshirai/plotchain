-- Task 1's V25 (self-performance-bonus plan) added SELF_PERFORMANCE to the Java IncomeType
-- enum but missed widening ledger_entry's income_type CHECK constraint, defined inline/unnamed
-- back in V1__create_dashboard_tables.sql: CHECK (income_type IN ('DIRECT','MATCHING',
-- 'SPONSOR_MATCHING','ROYALTY','REWARD','PERK')). Every unit test mocks the repository, so
-- nothing exercised a real insert until Task 7's integration test hit it: inserting a
-- SELF_PERFORMANCE ledger entry throws a check-constraint violation.
--
-- The original CHECK has no explicit name, so its generated name differs by engine (Postgres
-- would auto-name it ledger_entry_income_type_check by convention; H2 in PostgreSQL mode
-- generates an opaque CONSTRAINT_nnnn instead) -- neither is safe to target with a single
-- portable DROP CONSTRAINT. Rebuild the table instead: identical schema to today's (V1 + V16's
-- source_ref column + V17's NOT NULL/unique tightening) except the widened CHECK.
--
-- The rebuilt table's own PK and CHECK get explicit names (pk_ledger_entry,
-- chk_ledger_entry_income_type) rather than staying implicit -- the same unnamed-constraint
-- problem this migration is fixing would otherwise just reappear for whoever next needs to
-- ALTER this table, since implicit names aren't just engine-specific but here also collide
-- with ledger_entry_old's still-live implicit names until the DROP TABLE below runs.
ALTER TABLE ledger_entry RENAME TO ledger_entry_old;

CREATE TABLE ledger_entry (
    id UUID CONSTRAINT pk_ledger_entry PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    income_type VARCHAR(30) NOT NULL CONSTRAINT chk_ledger_entry_income_type CHECK (income_type IN ('DIRECT','MATCHING','SPONSOR_MATCHING','ROYALTY','REWARD','PERK','SELF_PERFORMANCE')),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    gross_amount NUMERIC(14,2) NOT NULL,
    tds_deduction NUMERIC(14,2) NOT NULL,
    admin_deduction NUMERIC(14,2) NOT NULL,
    net_amount NUMERIC(14,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','CARRIED_FORWARD','PAID','REVERSED')),
    created_at TIMESTAMP NOT NULL,
    source_ref UUID NOT NULL
);

INSERT INTO ledger_entry (id, associate_id, income_type, cycle_id, gross_amount, tds_deduction, admin_deduction, net_amount, status, created_at, source_ref)
SELECT id, associate_id, income_type, cycle_id, gross_amount, tds_deduction, admin_deduction, net_amount, status, created_at, source_ref
FROM ledger_entry_old;

DROP TABLE ledger_entry_old;

CREATE INDEX idx_ledger_associate_cycle ON ledger_entry(associate_id, cycle_id);
ALTER TABLE ledger_entry ADD CONSTRAINT uq_ledger_entry_idempotency
    UNIQUE (associate_id, cycle_id, income_type, source_ref);
