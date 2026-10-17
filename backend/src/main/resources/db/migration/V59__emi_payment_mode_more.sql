-- EMI payment modes widened: + UPI / DEMAND_DRAFT / NEFT / RTGS. Enum + CHECK change together (see V26 lesson).
ALTER TABLE emi_installment DROP CONSTRAINT chk_emi_installment_payment_mode;
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_payment_mode
    CHECK (payment_mode IN ('CASH','CHEQUE','BANK_TRANSFER','UPI','DEMAND_DRAFT','NEFT','RTGS'));
