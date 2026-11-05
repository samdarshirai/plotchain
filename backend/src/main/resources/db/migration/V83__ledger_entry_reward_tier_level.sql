-- A REWARD row is identified by its tier LEVEL, not reward_tier.id: every plan save (and the
-- same-day autosave replace) creates new reward_tier rows, which orphaned or hid earlier awards.
-- source_ref keeps the tier id of the plan version in force when the row was written.
ALTER TABLE ledger_entry ADD COLUMN tier_level INT NULL;

UPDATE ledger_entry
SET tier_level = (SELECT t.tier_level FROM reward_tier t WHERE t.id = ledger_entry.source_ref)
WHERE income_type = 'REWARD';
