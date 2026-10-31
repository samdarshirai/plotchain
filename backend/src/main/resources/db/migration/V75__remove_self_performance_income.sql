-- Self-Performance Bonus removed. Existing SELF_PERFORMANCE ledger rows are deleted (product
-- decision 2026-10-31). Wallet credits already given for them are NOT reversed here -- check
-- `SELECT status, SUM(net_amount) FROM ledger_entry WHERE income_type = 'SELF_PERFORMANCE' GROUP BY status`
-- in prod before this runs.
DELETE FROM ledger_entry WHERE income_type = 'SELF_PERFORMANCE';
ALTER TABLE ledger_entry DROP CONSTRAINT chk_ledger_entry_income_type;
ALTER TABLE ledger_entry ADD CONSTRAINT chk_ledger_entry_income_type CHECK (income_type IN (
    'DIRECT', 'MATCHING', 'SPONSOR_MATCHING', 'ROYALTY', 'REWARD'
));

DROP TABLE self_performance_bonus_config;
ALTER TABLE compensation_plan_version DROP COLUMN self_performance_tier1_pct;
ALTER TABLE compensation_plan_version DROP COLUMN self_performance_tier1_sqft_threshold;
ALTER TABLE compensation_plan_version DROP COLUMN self_performance_tier2_pct;
ALTER TABLE compensation_plan_version DROP COLUMN self_performance_tier2_sqft_threshold;
