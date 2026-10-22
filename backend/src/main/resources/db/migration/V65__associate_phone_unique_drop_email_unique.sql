-- Identity uniqueness is PAN, Aadhaar and phone; email is a plain contact field.
-- Unique where present: blank phones become NULL first so they don't collide.
DROP INDEX idx_associate_email;
UPDATE associate SET phone = NULL WHERE phone IS NOT NULL AND TRIM(phone) = '';
CREATE UNIQUE INDEX idx_associate_phone ON associate(phone);
