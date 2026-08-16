-- compensation-plan-reference.md §4 / the source PDF's own "remaining N Lakh will be carried
-- forward for the next level target" captions: Reward Income tiers are consumed sequentially
-- with a strict "exceeds" boundary, and any leftover matched volume not enough to clear the next
-- tier carries forward to the next cycle -- the same pattern already implemented for leg volumes
-- (LegVolume.carriedForwardLeft/Right). This tracks that leftover per associate.
ALTER TABLE associate ADD COLUMN reward_volume_carried_forward NUMERIC(14,2) NOT NULL DEFAULT 0;
