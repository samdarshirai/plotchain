-- Sale buyer is an associate: store buyer_associate_id and derive the name; the buyer_name snapshot is redundant.
-- Nullable: legacy sales without a booking have no buyer associate.
ALTER TABLE sale ADD COLUMN buyer_associate_id UUID REFERENCES associate(id);
UPDATE sale SET buyer_associate_id = (SELECT b.buyer_associate_id FROM plot_booking b WHERE b.id = sale.booking_id)
 WHERE booking_id IS NOT NULL;
ALTER TABLE sale DROP COLUMN buyer_name;
