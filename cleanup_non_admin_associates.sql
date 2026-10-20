
-- Delete every associate row except role = 'ADMIN', plus all dependent rows.
-- Irreversible. Run inside transaction, verify row counts, then COMMIT
-- (or ROLLBACK to dry-run first).

BEGIN;

CREATE TEMP TABLE target_ids AS
  SELECT id FROM associate WHERE role <> 'ADMIN';

DELETE FROM emi_installment WHERE booking_id IN (
  SELECT id FROM plot_booking WHERE associate_id IN (SELECT id FROM target_ids)
);
DELETE FROM plot_booking        WHERE associate_id IN (SELECT id FROM target_ids);
DELETE FROM withdrawal_request  WHERE associate_id IN (SELECT id FROM target_ids);
DELETE FROM associate_kyc_document WHERE associate_id IN (SELECT id FROM target_ids);
DELETE FROM sale                WHERE associate_id IN (SELECT id FROM target_ids);
DELETE FROM ledger_entry        WHERE associate_id IN (SELECT id FROM target_ids);
DELETE FROM leg_volume          WHERE associate_id IN (SELECT id FROM target_ids);
DELETE FROM wallet              WHERE associate_id IN (SELECT id FROM target_ids);

UPDATE settings_audit_log SET changed_by_associate_id = NULL
  WHERE changed_by_associate_id IN (SELECT id FROM target_ids);
UPDATE compensation_plan_version SET created_by_associate_id = NULL
  WHERE created_by_associate_id IN (SELECT id FROM target_ids);

UPDATE associate SET parent_id = NULL
  WHERE parent_id IN (SELECT id FROM target_ids);
UPDATE associate SET sponsor_id = NULL
  WHERE sponsor_id IN (SELECT id FROM target_ids);

DELETE FROM associate WHERE id IN (SELECT id FROM target_ids);

COMMIT;
