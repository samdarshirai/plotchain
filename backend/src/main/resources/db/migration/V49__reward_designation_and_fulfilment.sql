-- Rewards screen: designation per tier, admin fulfilment (cash + perk handed over) tracking on
-- REWARD ledger rows. fulfilled_at is independent of ledger_entry.status (which only means the
-- cash was credited to the wallet by WalletCreditingService).
ALTER TABLE reward_tier ADD COLUMN designation VARCHAR(100);
ALTER TABLE ledger_entry ADD COLUMN fulfilled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ledger_entry ADD COLUMN fulfilment_remark VARCHAR(500);
