-- Re-apply the Reward rule "leg volume resets after every level" to rewards already awarded in
-- CLOSED cycles. Old rule: thresholds were cumulative (tiers 10L, 20L -> Level 2 at 20L total)
-- and a level needed strictly MORE than its threshold. New rule: each level needs its own
-- threshold of fresh matched volume (Level 2 at 10L + 20L = 30L total), reaching it is enough.
--
-- Per associate, with matched volume so far = SUM(min(left, right)) over closed cycles:
--   * a REWARD row for tier k is kept only if threshold_1 + ... + threshold_k <= matched so far;
--     every other closed-cycle REWARD row is deleted (revoked);
--   * a revoked row already paid into the wallet (status PAID) is debited back from the wallet;
--   * reward_volume_carried_forward = matched so far - thresholds of the kept tiers.
-- Only the current plan's tiers are considered. OPEN-cycle reward rows are provisional; the
-- Recalculate step below rebuilds them (and awards anything now reachable, e.g. exact hits).
--
-- Order: deploy the code first, run repair_leg_carry_forward.sql (if not yet run), then this,
-- then click Recalculate on any row in Associate Directory.
--
-- Run in a quiet window (no cycle close or payout running). Run as-is first: it ends in
-- ROLLBACK, so it only prints the report. Review it, change ROLLBACK to COMMIT, run again.
--
-- Report 1: every revoked row. new_wallet_balance < 0 means the associate already withdrew that
-- money; decide on those before COMMIT (the debit still runs and leaves the balance negative).
-- Report 2: every associate whose reward carry changes.

BEGIN;

CREATE TEMP TABLE finished_cycle AS
  SELECT id FROM cycle WHERE status IN ('CLOSED', 'PAID');

CREATE TEMP TABLE tier AS
  SELECT rt.id, rt.tier_level, rt.designation, rt.volume_threshold,
         SUM(rt.volume_threshold) OVER (ORDER BY rt.tier_level) AS needed
    FROM reward_tier rt
   WHERE rt.plan_version_id = (SELECT id FROM compensation_plan_version
                                WHERE effective_from <= CURRENT_DATE
                                ORDER BY effective_from DESC LIMIT 1);

CREATE TEMP TABLE matched AS
  SELECT lv.associate_id, SUM(LEAST(lv.left_leg_volume, lv.right_leg_volume)) AS cum_matched
    FROM leg_volume lv JOIN finished_cycle fc ON fc.id = lv.cycle_id
   GROUP BY lv.associate_id;

CREATE TEMP TABLE revoked AS
  SELECT le.id, le.associate_id, t.tier_level, t.designation, t.needed,
         le.net_amount, le.status, le.fulfilled_at, COALESCE(m.cum_matched, 0) AS cum_matched
    FROM ledger_entry le
    JOIN finished_cycle fc ON fc.id = le.cycle_id
    JOIN tier t ON t.id = le.source_ref
    LEFT JOIN matched m ON m.associate_id = le.associate_id
   WHERE le.income_type = 'REWARD'
     AND t.needed > COALESCE(m.cum_matched, 0);

-- Carry after the repair: matched so far minus the volume of every kept level. Kept closed-cycle
-- rows always form levels 1..k (needed grows with tier_level), so the highest kept needed is it.
CREATE TEMP TABLE new_carry AS
  SELECT a.id AS associate_id,
         a.reward_volume_carried_forward AS old_carry,
         COALESCE(m.cum_matched, 0) - COALESCE((
           SELECT MAX(t.needed)
             FROM ledger_entry le
             JOIN finished_cycle fc ON fc.id = le.cycle_id
             JOIN tier t ON t.id = le.source_ref
            WHERE le.income_type = 'REWARD' AND le.associate_id = a.id
              AND le.id NOT IN (SELECT id FROM revoked)), 0) AS new_carry
    FROM associate a
    LEFT JOIN matched m ON m.associate_id = a.id;

-- Report 1: revoked rewards.
SELECT a.user_id, a.name, r.cum_matched, r.tier_level, r.designation, r.needed AS now_needs,
       r.net_amount, r.status, r.fulfilled_at,
       CASE WHEN r.status = 'PAID' THEN COALESCE(w.balance, 0)
            - SUM(r.net_amount) FILTER (WHERE r.status = 'PAID') OVER (PARTITION BY r.associate_id)
       END AS new_wallet_balance
  FROM revoked r
  JOIN associate a ON a.id = r.associate_id
  LEFT JOIN wallet w ON w.associate_id = r.associate_id
 ORDER BY a.user_id, r.tier_level;

-- Report 2: reward carry changes.
SELECT a.user_id, a.name, c.old_carry, c.new_carry
  FROM new_carry c JOIN associate a ON a.id = c.associate_id
 WHERE c.new_carry <> c.old_carry
 ORDER BY a.user_id;

UPDATE wallet w
   SET balance = w.balance - p.total
  FROM (SELECT associate_id, SUM(net_amount) AS total
          FROM revoked WHERE status = 'PAID' GROUP BY associate_id) p
 WHERE w.associate_id = p.associate_id;

DELETE FROM ledger_entry WHERE id IN (SELECT id FROM revoked);

UPDATE associate a
   SET reward_volume_carried_forward = c.new_carry
  FROM new_carry c
 WHERE a.id = c.associate_id AND a.reward_volume_carried_forward <> c.new_carry;

ROLLBACK; -- dry run; change to COMMIT once the report looks right
