-- Plot Cancel: charge/refund snapshot on the booking, a non-deletable system expense type,
-- and room for the " New<n>" plot-number suffix added on every cancel.
ALTER TABLE plot_booking ADD COLUMN cancellation_charge_pct NUMERIC(5,2);
ALTER TABLE plot_booking ADD COLUMN cancellation_charge NUMERIC(14,2);
ALTER TABLE plot_booking ADD COLUMN refund_amount NUMERIC(14,2);

ALTER TABLE plot ALTER COLUMN plot_no TYPE VARCHAR(64);

ALTER TABLE expense_type ADD COLUMN system BOOLEAN NOT NULL DEFAULT FALSE;
INSERT INTO expense_type (id, name, status, system)
SELECT gen_random_uuid(), 'Plot Cancellation Refund', 'ACTIVE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM expense_type WHERE lower(name) = 'plot cancellation refund');
UPDATE expense_type SET system = TRUE WHERE lower(name) = 'plot cancellation refund';
