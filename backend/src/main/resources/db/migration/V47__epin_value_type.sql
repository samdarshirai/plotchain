-- Associate e-Pin Register screens show a pin type (dropdown) and value (INR) per pin.
ALTER TABLE epin ADD COLUMN pin_type VARCHAR(20) NOT NULL DEFAULT 'REGISTRATION';
ALTER TABLE epin ADD COLUMN pin_value NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE epin ADD CONSTRAINT epin_pin_type_check CHECK (pin_type IN ('REGISTRATION','TOPUP'));
ALTER TABLE epin ADD CONSTRAINT epin_pin_value_check CHECK (pin_value >= 0);
