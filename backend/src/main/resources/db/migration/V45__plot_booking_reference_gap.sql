-- plot-booking reference-gap unit 1 (docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md, U1).
-- Two-step payments: PENDING -> ENTERED (admin keyed it in) -> PAID (confirmed). PAID keeps meaning
-- "confirmed", so every existing PAID reader stays valid. Enum + CHECK widened together (see V26 lesson).
-- Both CHECKs below are named in V41, so DROP/ADD is portable across Postgres and H2 (same as V43).

-- (a) emi_installment
ALTER TABLE emi_installment DROP CONSTRAINT chk_emi_installment_status;
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_status
    CHECK (status IN ('PENDING','ENTERED','PAID','VOID'));
ALTER TABLE emi_installment ADD COLUMN confirmed_at TIMESTAMP;
ALTER TABLE emi_installment ADD COLUMN confirmed_by UUID REFERENCES associate(id);
ALTER TABLE emi_installment ADD COLUMN payment_mode VARCHAR(24);
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_payment_mode
    CHECK (payment_mode IN ('CASH','CHEQUE','UPI','BANK_TRANSFER','OTHER'));
-- Existing PAID rows (token installments included) were entered and confirmed in one step.
UPDATE emi_installment SET confirmed_at = paid_at, confirmed_by = recorded_by WHERE status = 'PAID';

-- (b) booking_event (PAY_CONFIRMED is 13 chars, fits VARCHAR(16))
ALTER TABLE booking_event DROP CONSTRAINT chk_booking_event_type;
ALTER TABLE booking_event ADD CONSTRAINT chk_booking_event_type
    CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED','PAY_CONFIRMED'));

-- (c) plot_booking price snapshot. total_amount stays = list_price - discount.
-- list_price/area_sqft/rate are nullable: pre-existing raw-INSERT tests omit them; backfill + createBooking fill them.
ALTER TABLE plot_booking ADD COLUMN list_price NUMERIC(14,2);
ALTER TABLE plot_booking ADD COLUMN discount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE plot_booking ADD CONSTRAINT chk_plot_booking_discount CHECK (discount >= 0);
ALTER TABLE plot_booking ADD COLUMN area_sqft NUMERIC(14,2);
ALTER TABLE plot_booking ADD COLUMN rate NUMERIC(14,2);
UPDATE plot_booking SET list_price = total_amount;
UPDATE plot_booking SET
    area_sqft = (SELECT p.area_sqft FROM plot p WHERE p.id = plot_booking.plot_id),
    rate      = (SELECT p.rate      FROM plot p WHERE p.id = plot_booking.plot_id);
