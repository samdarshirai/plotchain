-- Single Processing Fee: admin_charge_with_pan_pct is now the only deduction rate (UI label
-- "Processing Fee %"). The without-PAN rate is gone.
ALTER TABLE compensation_plan_version DROP COLUMN admin_charge_without_pan_pct;
