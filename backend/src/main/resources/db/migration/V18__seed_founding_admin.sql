-- Replaces AdminBootstrapRunner (an ApplicationRunner that seeded this row from
-- PLOTCHAIN_ADMIN_* environment variables, and only on a first boot against an empty
-- associate table). Seeding via migration means the founding admin always exists, in every
-- environment including every test run, with no configuration or manual bootstrap step
-- required -- see docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
-- "Resolved decisions" #1.
--
-- parent_id = NULL makes this row the root of the binary tree by construction -- no separate
-- "is root" flag needed. must_change_password = true forces a password rotation via
-- POST /api/associates/me/password on first login; that forced rotation is what makes shipping
-- a fixed default password acceptable here.
--
-- Default password: ChangeMe123! -- bcrypt hash below, generated and verified against this
-- project's own BCryptPasswordEncoder (cost factor 10, the $2a$ variant, same encoder
-- SecurityConfig wires up for every other password in this system).
INSERT INTO associate (
    id, user_id, name, password_hash, role, kyc_status, status,
    joined_at, cumulative_matched_volume, must_change_password
) VALUES (
    '00000000-0000-0000-0000-000000000001', 'admin', 'Administrator',
    '$2a$10$0Egz0wWudJb27UCZ1H4aZ.QYpaU0ge2AJWcouK2TBU7/5OeQize0u',
    'ADMIN', 'VERIFIED', 'ACTIVE', CURRENT_TIMESTAMP, 0, TRUE
);
