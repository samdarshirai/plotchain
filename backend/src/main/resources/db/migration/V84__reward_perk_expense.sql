-- Reward tier perk: an expense type + value. When an associate achieves the tier, an expense row is
-- auto-created (RewardPerkExpenseService), keyed by (associate, tier level) so recomputes never duplicate it.
ALTER TABLE reward_tier ADD COLUMN perk_expense_type_id UUID NULL REFERENCES expense_type(id);
ALTER TABLE reward_tier ADD COLUMN perk_value NUMERIC(14,2) NULL;
ALTER TABLE reward_tier ADD CONSTRAINT chk_reward_tier_perk
    CHECK ((perk_expense_type_id IS NULL AND perk_value IS NULL)
        OR (perk_expense_type_id IS NOT NULL AND perk_value > 0));

ALTER TABLE expense ADD COLUMN source_associate_id UUID NULL REFERENCES associate(id);
ALTER TABLE expense ADD COLUMN source_tier_level INT NULL;
ALTER TABLE expense ADD CONSTRAINT chk_expense_source
    CHECK ((source_associate_id IS NULL AND source_tier_level IS NULL)
        OR (source_associate_id IS NOT NULL AND source_tier_level IS NOT NULL));
CREATE UNIQUE INDEX uq_expense_reward_source ON expense (source_associate_id, source_tier_level);
