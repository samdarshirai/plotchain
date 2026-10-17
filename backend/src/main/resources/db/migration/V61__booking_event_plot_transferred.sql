-- plot transfer: audit event. Enum + CHECK widened together (V43/V45/V46 lesson).
ALTER TABLE booking_event DROP CONSTRAINT chk_booking_event_type;
ALTER TABLE booking_event ADD CONSTRAINT chk_booking_event_type
    CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED','PAY_CONFIRMED','RESCHEDULED','PLOT_TRANSFERRED'));
