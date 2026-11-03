-- Cycles have no fixed term: period_end stays NULL until the admin closes the cycle and picks the end date.
ALTER TABLE cycle ALTER COLUMN period_end DROP NOT NULL;

ALTER TABLE compensation_plan_version DROP CONSTRAINT chk_settlement_cycle;
ALTER TABLE compensation_plan_version DROP COLUMN settlement_cycle;
