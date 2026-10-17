-- When a payment was entered into the system (distinct from paid_at = the TXN date). Existing rows fall back to paid_at.
ALTER TABLE emi_installment ADD COLUMN recorded_at TIMESTAMP;
UPDATE emi_installment SET recorded_at = paid_at WHERE paid_at IS NOT NULL;
