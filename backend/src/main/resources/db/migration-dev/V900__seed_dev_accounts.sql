-- LOCAL DEVELOPMENT ONLY. Loaded only when the `dev` profile is active (see
-- application-dev.yml). This is a publicly-known credential and must never be applied to a
-- real deployment.
--   associate01 / Password123!  (role ASSOCIATE)
--
-- The ADMIN account used to be seeded here too (admin / Password123!, no forced password
-- change). V18__seed_founding_admin.sql now seeds the one ADMIN row in every environment, dev
-- included -- keeping a second ADMIN insert here would collide with it on
-- idx_associate_user_id (both used user_id = 'admin'). Log in locally as admin / ChangeMe123!
-- instead (forced to change password on first login).
--
-- Versioned V900 to stay clear of the main migration sequence, which is free to grow to V899
-- before colliding.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Associate', 1, 5000);

INSERT INTO associate (id, sponsor_id, parent_id, position, name, rank_id, kyc_status, joined_at, cumulative_matched_volume, last_active_at, user_id, email, password_hash, role, must_change_password) VALUES
    ('22222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'Test Associate', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'associate01', 'associate@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ASSOCIATE', FALSE);
