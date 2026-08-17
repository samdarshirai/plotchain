-- Nullable: CycleService's rank-promotion logic (advanceRanks) sets this only when an
-- associate is actually promoted to a higher rank tier -- never at initial provisioning
-- (AssociateProvisioningService assigns the starting rank, which isn't an "upgrade").
-- NULL means "never promoted" for every associate, including ones promoted before this
-- column existed -- that's correct semantics, not a backfill gap to fill in later
-- (docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md Section 2).
ALTER TABLE associate ADD COLUMN rank_changed_at TIMESTAMP;
