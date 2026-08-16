-- compensation-plan-reference.md §3 / §5: Royalty Bonus is volume-slab ("highest threshold not
-- exceeded" against the associate's own matched business this cycle), not rank-keyed as V8
-- originally modeled it. royalty_bonus_rate has never been seeded until now (no existing rows to
-- migrate), so the table is dropped and recreated rather than ALTERed -- H2 (test datasource) and
-- Postgres disagree on whether DROP COLUMN cascades to a dependent UNIQUE constraint, and a fresh
-- CREATE TABLE sidesteps that dialect difference entirely.
DROP TABLE royalty_bonus_rate;

CREATE TABLE royalty_bonus_rate (
    id UUID PRIMARY KEY,
    plan_version_id UUID NOT NULL REFERENCES compensation_plan_version(id),
    volume_threshold NUMERIC(14,2) NOT NULL,
    royalty_pct NUMERIC(5,2) NOT NULL,
    UNIQUE (plan_version_id, volume_threshold)
);
CREATE INDEX idx_royalty_bonus_rate_plan_version_id ON royalty_bonus_rate(plan_version_id);

-- The 5 published slabs, seeded against the genesis plan version (same id V8 seeds).
INSERT INTO royalty_bonus_rate (id, plan_version_id, volume_threshold, royalty_pct) VALUES
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 2000000.00, 1.00),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 4000000.00, 1.50),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 8000000.00, 2.00),
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 15000000.00, 2.50),
    ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 30000000.00, 3.00);
