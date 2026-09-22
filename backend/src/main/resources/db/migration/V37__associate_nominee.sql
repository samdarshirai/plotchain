-- Profile screen redesign ("Viraj Acres" mockup, Nominee Detail section): an associate's own
-- nominee, self-service editable. One row per associate, same FK+index shape as V34's
-- associate_bank_details, not a widening of the associate table -- this is a separate optional
-- sub-resource with its own empty state, same reasoning that already split bank details off
-- from profile.
CREATE TABLE associate_nominee (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL UNIQUE REFERENCES associate(id),
    nominee_name VARCHAR(120),
    relation VARCHAR(60),
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_associate_nominee_associate_id ON associate_nominee(associate_id);
