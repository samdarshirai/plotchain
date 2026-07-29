-- Seed test accounts for login (this app has no signup flow — accounts are provisioned
-- here). Both use the same password for simplicity:
--   associate@plotchain.test / Password123!  (role ASSOCIATE)
--   admin@plotchain.test     / Password123!  (role ADMIN)
-- password_hash is a BCrypt hash of "Password123!" (cost 10).

ALTER TABLE associate ADD COLUMN email VARCHAR(255);
ALTER TABLE associate ADD COLUMN password_hash VARCHAR(60);
ALTER TABLE associate ADD COLUMN role VARCHAR(20);

-- Structural placeholder: rank_id is a NOT NULL FK on associate, but "rank" is an
-- MLM-associate concept that doesn't really apply to a platform admin. Both seeded
-- rows point at this one rank row purely to satisfy the FK constraint. rank_order=999
-- is deliberately out of the way of real rank tiers (which start at 1) and of the
-- rank_order=1 rows several tests create in their own (rolled-back) transactions —
-- this seeded row is committed at migration time, outside any test transaction, so it
-- persists for the life of the shared test database and would collide with
-- rank_tier's UNIQUE(rank_order) constraint if it used rank_order=1 too.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Associate', 999, 5000);

INSERT INTO associate (id, sponsor_id, parent_id, position, name, rank_id, kyc_status, joined_at, cumulative_matched_volume, last_active_at, email, password_hash, role) VALUES
    ('22222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'Test Associate', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'associate@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ASSOCIATE'),
    ('33333333-3333-3333-3333-333333333333', NULL, NULL, NULL, 'Test Admin', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'admin@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ADMIN');

-- Backfill any pre-existing associate rows (from before this migration) before the columns
-- below are constrained NOT NULL. Without this, ALTER COLUMN ... SET NOT NULL throws on any
-- non-empty associate table, Flyway marks V2 as failed, and the DB is left half-migrated
-- (columns added, but not the NOT NULL constraints, chk_associate_role, or idx_associate_email
-- below) — recoverable only via a manual `flyway repair` plus hand backfill.
--
-- The password_hash placeholder below is exactly 60 characters (the $2y$10$ prefix + 22-char
-- salt + 31-char hash that BCrypt's format expects, so BCryptPasswordEncoder.matches() parses
-- it without throwing) but it is NOT a real BCrypt hash of any password — the salt/hash body
-- was never produced by hashing anything, so no password will ever match it. Whoever owns a
-- pre-existing row needs a real credential provisioned by an operator before they can
-- authenticate.
UPDATE associate SET
    email = COALESCE(email, id || '@placeholder.invalid'),
    password_hash = COALESCE(password_hash, '$2y$10$unusableunusableunusableunusableunusableunusableunusa'),
    role = COALESCE(role, 'ASSOCIATE')
WHERE email IS NULL OR password_hash IS NULL OR role IS NULL;

ALTER TABLE associate ALTER COLUMN email SET NOT NULL;
ALTER TABLE associate ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE associate ALTER COLUMN role SET NOT NULL;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role CHECK (role IN ('ADMIN','ASSOCIATE'));
CREATE UNIQUE INDEX idx_associate_email ON associate(email);
