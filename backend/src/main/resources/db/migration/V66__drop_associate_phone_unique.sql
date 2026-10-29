-- Phone is no longer an identity key; several associates may share one number.
DROP INDEX idx_associate_phone;
