-- role-capability unit 7: PlotBooking/EMISchedule runtime the V14 booking_emi_config
-- migration's own comment flagged as not yet built ("no PlotBooking/EMISchedule transactional
-- tables exist yet, this only stores the policy that will govern them"). This migration adds
-- those two tables; BookingService applies the existing booking_emi_config policy row to compute
-- each booking's installment schedule at creation time.

CREATE TABLE plot_booking (
    id UUID PRIMARY KEY,
    plot_id UUID NOT NULL REFERENCES plot(id),
    associate_id UUID NOT NULL REFERENCES associate(id),
    total_amount NUMERIC(14,2) NOT NULL,
    installment_count INTEGER NOT NULL,
    booked_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_plot_booking_associate_id ON plot_booking(associate_id);

CREATE TABLE emi_installment (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES plot_booking(id),
    installment_number INTEGER NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    due_date DATE NOT NULL
);
CREATE INDEX idx_emi_installment_booking_id ON emi_installment(booking_id);
