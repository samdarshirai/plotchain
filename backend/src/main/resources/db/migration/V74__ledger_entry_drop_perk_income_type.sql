-- PERK income type removed: nothing ever wrote a PERK ledger row (a reward's perk is the
-- RewardTier.perk_description on the REWARD entry). Narrow the CHECK to match IncomeType.
-- No DELETE on purpose: if a PERK row somehow exists, the ADD fails loudly instead of losing data.
ALTER TABLE ledger_entry DROP CONSTRAINT chk_ledger_entry_income_type;
ALTER TABLE ledger_entry ADD CONSTRAINT chk_ledger_entry_income_type CHECK (income_type IN (
    'DIRECT', 'MATCHING', 'SPONSOR_MATCHING', 'ROYALTY', 'REWARD', 'SELF_PERFORMANCE'
));
