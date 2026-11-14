-- buyer name is derived from buyer_associate_id (NOT NULL since V86); the snapshot column is redundant.
ALTER TABLE plot_booking DROP COLUMN buyer_name;
