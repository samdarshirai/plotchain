-- Repair: leg_credited must be the BUYER's position (volume goes to the buyer's placement parent).
-- Volume itself is computed live from sale.associate_id, so only this snapshot column needs fixing.
-- Scope: open-cycle, non-voided sales that have a buyer. Closed cycles are left as historical.
-- Run in a transaction; check the preview first.

-- Preview
SELECT s.id, s.leg_credited AS old_leg, b.position AS new_leg
FROM sale s
JOIN cycle c ON c.id = s.cycle_id AND c.status = 'OPEN'
JOIN associate b ON b.id = s.buyer_associate_id
WHERE s.status = 'RECORDED' AND b.position IN ('L','R') AND s.leg_credited <> b.position;

BEGIN;
UPDATE sale s
SET leg_credited = b.position
FROM associate b, cycle c
WHERE b.id = s.buyer_associate_id
  AND c.id = s.cycle_id AND c.status = 'OPEN'
  AND s.status = 'RECORDED'
  AND b.position IN ('L','R')
  AND s.leg_credited <> b.position;
COMMIT;
