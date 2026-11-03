-- Plot buyer is now an existing associate (with an activation e-PIN). Nullable: older bookings only
-- have the free-text buyer_name and are cleaned up separately.
ALTER TABLE plot_booking ADD COLUMN buyer_associate_id UUID REFERENCES associate(id);
CREATE INDEX idx_plot_booking_buyer_associate ON plot_booking (buyer_associate_id);
