-- EMI payment modes narrowed to CASH / CHEQUE / BANK_TRANSFER. Enum + CHECK change together (see V26 lesson).
UPDATE emi_installment SET payment_mode = 'BANK_TRANSFER' WHERE payment_mode IN ('UPI','OTHER');
ALTER TABLE emi_installment DROP CONSTRAINT chk_emi_installment_payment_mode;
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_payment_mode
    CHECK (payment_mode IN ('CASH','CHEQUE','BANK_TRANSFER'));
