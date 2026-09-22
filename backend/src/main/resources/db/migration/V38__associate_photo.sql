-- Profile screen redesign ("Viraj Acres" mockup, hero photo upload): one row per associate,
-- BYTEA content shape identical to V19's associate_kyc_document and V7's company_branding --
-- not a reuse of company_branding (that's a company-wide singleton), since a photo is
-- per-associate. Re-uploading overwrites the existing row (same overwrite convention as both of
-- those).
CREATE TABLE associate_photo (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL UNIQUE REFERENCES associate(id),
    content BYTEA NOT NULL,
    content_type VARCHAR(64) NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_associate_photo_associate_id ON associate_photo(associate_id);
