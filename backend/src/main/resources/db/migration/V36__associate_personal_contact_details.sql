-- Profile screen redesign ("Viraj Acres" mockup, Personal Detail / Contact Detail sections):
-- extends the same "who is this person" record name/phone/email/address already live on, rather
-- than a sibling table -- these are all facets of one logical profile, same reasoning V11/V35
-- used to grow this table with phone/address. All nullable: optional-to-fill-in, matching the
-- existing phone/email/address columns' nullability.
ALTER TABLE associate ADD COLUMN father_husband_name VARCHAR(120);
ALTER TABLE associate ADD COLUMN date_of_birth DATE;
ALTER TABLE associate ADD COLUMN gender VARCHAR(16);
ALTER TABLE associate ADD COLUMN marital_status VARCHAR(16);
ALTER TABLE associate ADD COLUMN state VARCHAR(80);
ALTER TABLE associate ADD COLUMN district VARCHAR(80);
ALTER TABLE associate ADD COLUMN postal_code VARCHAR(12);
