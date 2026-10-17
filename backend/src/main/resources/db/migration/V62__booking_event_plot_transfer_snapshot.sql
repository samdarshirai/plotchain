-- plot transfer snapshot: old/new plot and paid/rest amounts at transfer time. NULL on non-transfer and pre-V62 events.
ALTER TABLE booking_event ADD COLUMN old_plot_id UUID;
ALTER TABLE booking_event ADD COLUMN new_plot_id UUID;
ALTER TABLE booking_event ADD COLUMN paid_amount NUMERIC(14,2);
ALTER TABLE booking_event ADD COLUMN rest_amount NUMERIC(14,2);
