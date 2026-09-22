-- Profile screen redesign ("Viraj Acres" mockup, Transaction Password / Authorisation gate): a
-- second auth secret with the exact same shape and lifecycle as password_hash (V1), so it's a
-- nullable column on associate rather than a new table -- one secret isn't worth a join. Null
-- means "not yet set", which the profile/nominee save gate treats as bootstrapping (no
-- transaction password required until the associate sets one).
ALTER TABLE associate ADD COLUMN transaction_password_hash VARCHAR(255);
