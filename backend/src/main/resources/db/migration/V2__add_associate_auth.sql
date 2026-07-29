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

ALTER TABLE associate ALTER COLUMN email SET NOT NULL;
ALTER TABLE associate ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE associate ALTER COLUMN role SET NOT NULL;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role CHECK (role IN ('ADMIN','ASSOCIATE'));
CREATE UNIQUE INDEX idx_associate_email ON associate(email);
