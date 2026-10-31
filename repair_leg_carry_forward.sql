-- Repair leg-volume carry-forward lost to two bugs (fixed in code, deploy those first):
--   1. A cycle closing with one empty leg dropped the other leg's whole volume.
--   2. Paying a cycle's income moved the cycle to PAID, and the next cycle's rollup only read
--      CLOSED cycles, so a paid cycle's carry was skipped. Cycles now stay CLOSED (V73 moves
--      old PAID cycles back); 'PAID' is still matched below so this also works before V73.
--
-- With full carry, volume matched so far = min(cumulative left, cumulative right), so the
-- correct carry out of the latest closed cycle is, per leg:
--   cumulative leg business - cumulative matched volume.
-- This writes that onto each associate's leg_volume row in that cycle. The lost volume then
-- matches in the current OPEN cycle (Matching + Reward, at current rates); past payouts are
-- left untouched.
--
-- Run in a quiet window (no cycle close or payout running). Run as-is first: it ends in
-- ROLLBACK, so it only prints the report. Review it, change ROLLBACK to COMMIT, run again.
-- Then click Recalculate on any row in Associate Directory so live income picks it up.
--
-- over_matched_volume > 0 means past cycles matched more than the leg business supports
-- (a skipped paid cycle let an older carry count twice, or a sale was voided after close).
-- Those rows get carry 0; any over-payment needs a manual decision.

BEGIN;

CREATE TEMP TABLE finished_cycle AS
  SELECT id, period_start FROM cycle WHERE status IN ('CLOSED', 'PAID');

CREATE TEMP TABLE repair AS
WITH RECURSIVE leg(ancestor_id, side, member_id) AS (
  -- Same leg rule as CycleService.rollUpSubtree: position 'R' is the right leg, anything else left.
  SELECT parent_id, CASE WHEN position = 'R' THEN 'R' ELSE 'L' END, id
    FROM associate WHERE parent_id IS NOT NULL
  UNION ALL
  SELECT leg.ancestor_id, leg.side, a.id
    FROM associate a JOIN leg ON a.parent_id = leg.member_id
),
business AS (
  SELECT leg.ancestor_id AS associate_id,
         COALESCE(SUM(s.amount) FILTER (WHERE leg.side = 'L'), 0) AS cum_left,
         COALESCE(SUM(s.amount) FILTER (WHERE leg.side = 'R'), 0) AS cum_right
    FROM leg
    JOIN sale s ON s.associate_id = leg.member_id AND s.status = 'RECORDED'
    JOIN finished_cycle fc ON fc.id = s.cycle_id
   GROUP BY leg.ancestor_id
),
matched AS (
  SELECT lv.associate_id, SUM(LEAST(lv.left_leg_volume, lv.right_leg_volume)) AS cum_matched
    FROM leg_volume lv JOIN finished_cycle fc ON fc.id = lv.cycle_id
   GROUP BY lv.associate_id
),
target AS (
  SELECT id FROM finished_cycle ORDER BY period_start DESC LIMIT 1
)
SELECT lv.id AS leg_volume_id,
       lv.associate_id,
       COALESCE(b.cum_left, 0) AS cum_left,
       COALESCE(b.cum_right, 0) AS cum_right,
       COALESCE(m.cum_matched, 0) AS cum_matched,
       lv.carried_forward_left AS old_cf_left,
       lv.carried_forward_right AS old_cf_right,
       GREATEST(COALESCE(b.cum_left, 0) - COALESCE(m.cum_matched, 0), 0) AS new_cf_left,
       GREATEST(COALESCE(b.cum_right, 0) - COALESCE(m.cum_matched, 0), 0) AS new_cf_right,
       GREATEST(COALESCE(m.cum_matched, 0)
                - LEAST(COALESCE(b.cum_left, 0), COALESCE(b.cum_right, 0)), 0) AS over_matched_volume
  FROM leg_volume lv
  JOIN target t ON t.id = lv.cycle_id
  LEFT JOIN business b ON b.associate_id = lv.associate_id
  LEFT JOIN matched m ON m.associate_id = lv.associate_id;

-- Report: every associate whose carry changes or who was over-matched.
SELECT a.user_id, a.name, r.cum_left, r.cum_right, r.cum_matched,
       r.old_cf_left, r.new_cf_left, r.old_cf_right, r.new_cf_right, r.over_matched_volume
  FROM repair r JOIN associate a ON a.id = r.associate_id
 WHERE r.new_cf_left <> r.old_cf_left OR r.new_cf_right <> r.old_cf_right OR r.over_matched_volume > 0
 ORDER BY a.user_id;

UPDATE leg_volume lv
   SET carried_forward_left = r.new_cf_left,
       carried_forward_right = r.new_cf_right
  FROM repair r
 WHERE lv.id = r.leg_volume_id
   AND (lv.carried_forward_left <> r.new_cf_left OR lv.carried_forward_right <> r.new_cf_right);

ROLLBACK; -- dry run; change to COMMIT once the report looks right
