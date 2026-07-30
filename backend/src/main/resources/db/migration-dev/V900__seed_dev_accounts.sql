-- LOCAL DEVELOPMENT ONLY. Loaded only when the `dev` profile is active (see
-- application-dev.yml). These are publicly-known credentials and must never be applied to a
-- real deployment.
--   associate01 / Password123!  (role ASSOCIATE)
--   admin       / Password123!  (role ADMIN)
--
-- Versioned V900 to stay clear of the main migration sequence, which is free to grow to V899
-- before colliding.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Associate', 1, 5000);

INSERT INTO associate (id, sponsor_id, parent_id, position, name, rank_id, kyc_status, joined_at, cumulative_matched_volume, last_active_at, user_id, email, password_hash, role, must_change_password) VALUES
    ('22222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'Test Associate', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'associate01', 'associate@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ASSOCIATE', FALSE),
    ('33333333-3333-3333-3333-333333333333', NULL, NULL, NULL, 'Test Admin', NULL, 'VERIFIED', NOW(), 0, NULL, 'admin', 'admin@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ADMIN', FALSE);
