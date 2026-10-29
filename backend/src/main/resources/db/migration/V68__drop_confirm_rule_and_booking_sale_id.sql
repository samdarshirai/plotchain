-- Booking confirmation is gone: business/income is credited per admin-confirmed payment, so the
-- confirm rule/threshold policy and the booking -> single sale link are dead. sale.booking_id still
-- links each per-payment sale back to its booking.
ALTER TABLE booking_emi_config DROP CONSTRAINT chk_confirm_rule;
ALTER TABLE booking_emi_config DROP COLUMN confirm_rule;
ALTER TABLE booking_emi_config DROP COLUMN confirm_threshold_percent;
ALTER TABLE plot_booking DROP COLUMN sale_id;
