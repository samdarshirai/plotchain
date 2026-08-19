-- Defense in depth alongside AssociateProvisioningService's own validation: an associate with a
-- parent but no position is invisible to AssociateRepository.countDownlineByPosition's per-leg
-- counts (dashboard team snapshot) while still counted in countDownline and credited to a leg by
-- CycleService's matching-income rollup. No seed data or currently passing test persists this
-- combination, but the pre-fix service guard let it through (position != null was the only
-- check), and the create-associate form had no required validator on the L/R toggle -- any
-- environment that used this app before this migration may already hold rows the CHECK below
-- would otherwise reject outright, aborting Flyway's migrate step and leaving the app down.
-- Backfill first: attribute every existing parented-but-positionless row to the LEFT leg, the
-- same attribution CycleService's matching-income rollup already gives them today
-- ("R".equals(position) ? right : left -- null is not "R", so it's already being treated as
-- left in every volume calculation; this backfill just makes that explicit on the row itself).
UPDATE associate SET position = 'L' WHERE parent_id IS NOT NULL AND position IS NULL;

ALTER TABLE associate ADD CONSTRAINT chk_associate_position_required_with_parent
    CHECK (parent_id IS NULL OR position IS NOT NULL);
