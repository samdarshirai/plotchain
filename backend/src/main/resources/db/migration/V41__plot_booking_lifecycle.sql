-- plot-booking-lifecycle unit 1 (docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md,
-- Data model). One migration for the whole spec: units 2-9 all build on these columns.

ALTER TABLE plot_booking ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE plot_booking ADD CONSTRAINT chk_plot_booking_status
    CHECK (status IN ('ACTIVE','CONFIRMED','CANCELLED'));
ALTER TABLE plot_booking ADD COLUMN buyer_name VARCHAR(200);
UPDATE plot_booking SET buyer_name =
    (SELECT a.name FROM associate a WHERE a.id = plot_booking.associate_id);
ALTER TABLE plot_booking ALTER COLUMN buyer_name SET NOT NULL;
ALTER TABLE plot_booking ADD COLUMN buyer_phone VARCHAR(20);
ALTER TABLE plot_booking ADD COLUMN confirmed_at TIMESTAMP;
ALTER TABLE plot_booking ADD COLUMN cancelled_at TIMESTAMP;
ALTER TABLE plot_booking ADD COLUMN cancel_reason VARCHAR(255);
ALTER TABLE plot_booking ADD COLUMN sale_id UUID REFERENCES sale(id);

ALTER TABLE emi_installment ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'PENDING';
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_status
    CHECK (status IN ('PENDING','PAID','VOID'));
ALTER TABLE emi_installment ADD COLUMN paid_at TIMESTAMP;
ALTER TABLE emi_installment ADD COLUMN payment_ref VARCHAR(100);
ALTER TABLE emi_installment ADD COLUMN recorded_by UUID REFERENCES associate(id);

ALTER TABLE sale ADD COLUMN booking_id UUID REFERENCES plot_booking(id);
-- Unique only when non-null: both PostgreSQL and H2 allow many NULLs in a unique index.
CREATE UNIQUE INDEX uq_sale_booking_id ON sale(booking_id);

CREATE TABLE booking_event (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES plot_booking(id),
    type VARCHAR(16) NOT NULL,
    actor_id UUID NOT NULL REFERENCES associate(id),
    detail VARCHAR(500),
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_booking_event_type CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED'))
);
CREATE INDEX idx_booking_event_booking_id ON booking_event(booking_id);
