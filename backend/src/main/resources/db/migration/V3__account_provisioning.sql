-- Associates must change the temporary password an admin provisioned for them.
ALTER TABLE associate ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- "Rank" is an MLM-associate concept that does not apply to a platform admin. rank_id was
-- NOT NULL, which forced admin rows to reference a meaningless placeholder rank tier. Express
-- the real rule instead: associates have a rank, admins do not.
ALTER TABLE associate ALTER COLUMN rank_id DROP NOT NULL;
ALTER TABLE associate ADD CONSTRAINT chk_associate_rank_required
    CHECK (role = 'ADMIN' OR rank_id IS NOT NULL);
