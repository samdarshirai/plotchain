-- Defense in depth alongside AssociateProvisioningService's own validation: an associate with a
-- parent but no position is invisible to AssociateRepository.countDownlineByPosition's per-leg
-- counts (dashboard team snapshot) while still counted in countDownline and credited to a leg by
-- CycleService's matching-income rollup. Safe to add with no backfill: no seed data or currently
-- passing test persists this combination (verified 2026-08-19 against every @DataJpaTest/
-- @SpringBootTest fixture in the suite).
ALTER TABLE associate ADD CONSTRAINT chk_associate_position_required_with_parent
    CHECK (parent_id IS NULL OR position IS NOT NULL);
