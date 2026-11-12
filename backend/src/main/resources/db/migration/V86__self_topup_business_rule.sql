-- Top-up business now derives from plot_booking.buyer_associate_id (see SaleRepository.sumTopUpBusiness),
-- so the Add Plot EMI flag is gone. A booking must have a buyer associate; this fails if any row lacks one.
ALTER TABLE emi_installment DROP COLUMN top_up;
ALTER TABLE plot_booking ALTER COLUMN buyer_associate_id SET NOT NULL;
