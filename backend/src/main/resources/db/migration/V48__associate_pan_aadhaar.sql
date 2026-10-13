-- Member registration via e-Pin Join: PAN/Aadhaar numbers (format enforced by request validation,
-- not a regex CHECK, so the H2 test profile stays compatible). Unique where present: plain unique
-- indexes allow multiple NULLs.
ALTER TABLE associate ADD COLUMN pan_number VARCHAR(10);
ALTER TABLE associate ADD COLUMN aadhaar_number VARCHAR(12);
CREATE UNIQUE INDEX idx_associate_pan_number ON associate(pan_number);
CREATE UNIQUE INDEX idx_associate_aadhaar_number ON associate(aadhaar_number);
-- Makes binary-tree placement race-safe: one child per (parent, leg). Root rows (NULL parent) are exempt.
CREATE UNIQUE INDEX idx_associate_parent_position ON associate(parent_id, position);
