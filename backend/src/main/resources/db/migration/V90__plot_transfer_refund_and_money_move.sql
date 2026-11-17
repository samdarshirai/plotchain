-- Plot transfer to a cheaper plot refunds the excess; money can move between one buyer's plots.
-- moved_in marks a PAID row that carries money moved from another booking (its income was already
-- credited on the source booking, so the Sale backfill must skip it).
ALTER TABLE emi_installment ADD COLUMN moved_in BOOLEAN NOT NULL DEFAULT FALSE;

-- Enum + CHECK widened together (V43/V45/V46 lesson).
ALTER TABLE booking_event DROP CONSTRAINT chk_booking_event_type;
ALTER TABLE booking_event ADD CONSTRAINT chk_booking_event_type
    CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED','PAY_CONFIRMED','RESCHEDULED','PLOT_TRANSFERRED','MONEY_MOVED'));

INSERT INTO expense_type (id, name, status, system)
SELECT gen_random_uuid(), 'Plot Transfer Refund', 'ACTIVE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM expense_type WHERE lower(name) = 'plot transfer refund');
UPDATE expense_type SET system = TRUE WHERE lower(name) = 'plot transfer refund';
