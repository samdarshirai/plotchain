-- Fresh deployments start with an empty rank_tier table (see V1__create_dashboard_tables.sql),
-- which makes root/associate provisioning fail with NoRankTiersConfiguredException on every clean
-- install -- the only seed that ever populated this table was the dev-only V900 fixture
-- (migration-dev, `dev` profile only, deliberately not shipped to production per
-- docs/superpowers/plans/2026-07-29-account-provisioning.md). Seeds the four default ranks shown
-- in the Compensation step's Royalty Bonus table mockup (Silver, Gold, Diamond, Crown), in
-- ascending rank_order.
--
-- rank_order intentionally starts at 10 and steps by 10, not 1/2/3/4: several @DataJpaTest tests
-- (AssociateRepositoryTest, CompensationPlanVersionRepositoryTest) persist their own throwaway
-- RankTier row with rank_order = 1 directly against the real datasource that this migration also
-- seeds, and rank_order is UNIQUE -- starting at 10 avoids colliding with that fixture data
-- without touching those test files.
--
-- volume_threshold values are placeholder defaults; nothing in the codebase auto-promotes an
-- associate by volume today, only display, so a placeholder is safe until real figures are set.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Silver',  10,       0.00),
    ('00000000-0000-0000-0000-000000000202', 'Gold',    20,  100000.00),
    ('00000000-0000-0000-0000-000000000203', 'Diamond', 30,  500000.00),
    ('00000000-0000-0000-0000-000000000204', 'Crown',   40, 1500000.00);
