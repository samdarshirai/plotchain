-- Free-form Extra Price: default on the plot, snapshot (overridable) on the booking.
-- booking.total_amount = list_price + extra_price - discount from now on.
ALTER TABLE plot ADD COLUMN extra_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0);
ALTER TABLE plot_booking ADD COLUMN extra_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0);
