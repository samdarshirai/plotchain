-- Sale/booking are attributed to the BUYER (associate_id); the buyer's sponsor is stored explicitly in
-- sponsor_id and is who receives binary volume, leg credit and Direct Income.
-- Until now associate_id held the sponsor, so sponsor_id is backfilled from it first.
ALTER TABLE plot_booking ADD COLUMN sponsor_id UUID REFERENCES associate(id);
UPDATE plot_booking SET sponsor_id = associate_id;
UPDATE plot_booking SET associate_id = buyer_associate_id;
ALTER TABLE plot_booking ALTER COLUMN sponsor_id SET NOT NULL;
CREATE INDEX idx_plot_booking_sponsor ON plot_booking(sponsor_id);

ALTER TABLE sale ADD COLUMN sponsor_id UUID REFERENCES associate(id);
UPDATE sale SET sponsor_id = associate_id;
UPDATE sale SET associate_id = buyer_associate_id WHERE buyer_associate_id IS NOT NULL;
ALTER TABLE sale ALTER COLUMN sponsor_id SET NOT NULL;
CREATE INDEX idx_sale_sponsor ON sale(sponsor_id);
