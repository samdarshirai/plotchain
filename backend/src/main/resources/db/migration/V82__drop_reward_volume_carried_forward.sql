-- Reward levels are now awarded from lifetime matched volume (cumulative_matched_volume) by tier
-- level, so the per-associate spend-down carry is no longer read or written.
ALTER TABLE associate DROP COLUMN reward_volume_carried_forward;
