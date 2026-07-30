-- Login moves from email to a user-chosen / auto-generated User ID (see setup-onboarding-spec.md
-- Step 6 and the associate login mockup, which shows an "Associate ID" field, not an email).
ALTER TABLE associate ADD COLUMN user_id VARCHAR(64);

-- Backfill pre-existing rows before the NOT NULL below, for the same reason V2 backfills:
-- SET NOT NULL throws on a non-empty table, Flyway marks V4 failed, and the DB is left
-- half-migrated. REGEXP_REPLACE is used instead of Postgres-only split_part(), since this
-- migration also runs against H2 (PostgreSQL mode) in @DataJpaTest.
UPDATE associate SET user_id = REGEXP_REPLACE(email, '@.*$', '') WHERE user_id IS NULL;

-- Two accounts can share an email local-part (a@x.com, a@y.com). Left alone that collides on
-- the unique index below and fails the migration mid-flight. Disambiguate deterministically
-- instead, so V4 always completes; an operator can rename afterwards.
UPDATE associate a SET user_id = a.user_id || '-' || SUBSTRING(REPLACE(CAST(a.id AS VARCHAR), '-', '') FROM 1 FOR 6)
WHERE EXISTS (SELECT 1 FROM associate b WHERE b.user_id = a.user_id AND b.id <> a.id);

ALTER TABLE associate ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX idx_associate_user_id ON associate (user_id);

-- Email is now a contact field, not a credential. Step 6 creates staff accounts with no email
-- at all. The unique index stays (both engines permit multiple NULLs under a unique index).
ALTER TABLE associate ALTER COLUMN email DROP NOT NULL;

ALTER TABLE associate DROP CONSTRAINT chk_associate_role;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role
    CHECK (role IN ('ADMIN','ASSOCIATE','SUPER_ADMIN','FINANCE','KYC_REVIEWER','SUPPORT'));

-- chk_associate_rank_required read `role = 'ADMIN' OR rank_id IS NOT NULL`, which would force
-- the four new staff roles to carry a meaningless rank tier. Invert it to state the real rule:
-- only associates have a rank.
ALTER TABLE associate DROP CONSTRAINT chk_associate_rank_required;
ALTER TABLE associate ADD CONSTRAINT chk_associate_rank_required
    CHECK (role <> 'ASSOCIATE' OR rank_id IS NOT NULL);
