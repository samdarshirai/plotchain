-- Adds the authentication columns to `associate`. No accounts are seeded here: production
-- bootstraps its first admin via AdminBootstrapRunner (env-driven), and local development
-- seeds test accounts from classpath:db/migration-dev, loaded only under the `dev` profile.

ALTER TABLE associate ADD COLUMN email VARCHAR(255);
ALTER TABLE associate ADD COLUMN password_hash VARCHAR(60);
ALTER TABLE associate ADD COLUMN role VARCHAR(20);

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
