-- Nullable: existing rows (admin-family and any prior associates) have no phone on file, and
-- the spec only requires it going forward for root associates, though the PRD wants it captured
-- generally, hence adding it here rather than scoping it to a root-only side table.
ALTER TABLE associate ADD COLUMN phone VARCHAR(20);
