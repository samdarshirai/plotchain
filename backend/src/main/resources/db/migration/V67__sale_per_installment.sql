-- Business/income is now credited per confirmed payment (one Sale per EMI installment), not once
-- per booking, so several sales may share a booking_id.
DROP INDEX uq_sale_booking_id;
CREATE INDEX idx_sale_booking_id ON sale(booking_id);
ALTER TABLE sale ADD COLUMN emi_installment_id UUID REFERENCES emi_installment(id);
CREATE UNIQUE INDEX uq_sale_emi_installment_id ON sale(emi_installment_id);
