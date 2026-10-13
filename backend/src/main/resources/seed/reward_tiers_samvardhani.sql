-- Manual, NOT a Flyway migration: seeds the 12-tier reward ladder from the Samvardhani income plan
-- PDF into the genesis plan version. Not auto-run because DataJpaTest fixtures assume the genesis
-- version has no reward tiers. Run once by hand: psql -f reward_tiers_samvardhani.sql
-- Guarded: only seeds an empty genesis version, never overwrites admin-configured tiers.
INSERT INTO reward_tier (id, plan_version_id, tier_level, volume_threshold, cash_reward, perk_description, designation)
SELECT CAST(v.id AS UUID), '00000000-0000-0000-0000-000000000001', v.lvl, v.vol, v.cash, v.perk, v.des
FROM (VALUES
    ('00000000-0000-0000-0000-000000000301', 1,500000.00,      15000.00, '+ Smart Watch',              'Sales Associate'),
    ('00000000-0000-0000-0000-000000000302', 2,1000000.00,      20000.00, '+ Manali Tour (2N/3D)',      'Sales Executive'),
    ('00000000-0000-0000-0000-000000000303', 3,2000000.00,      45000.00, '+ Goa Tour (3N/4D)',         'Sr. Sales Executive'),
    ('00000000-0000-0000-0000-000000000304', 4,4000000.00,      90000.00, '+ Thailand Tour (4N/5D)',    'Sales Manager'),
    ('00000000-0000-0000-0000-000000000305', 5,8000000.00,     180000.00, '+ Dubai Tour (5N/6D)',       'Sr. Sales Manager'),
    ('00000000-0000-0000-0000-000000000306', 6,15000000.00,     400000.00, 'Or Mini Car',                'Territory Manager'),
    ('00000000-0000-0000-0000-000000000307', 7,30000000.00,     800000.00, 'Or Big Car',                 'Chief Manager'),
    ('00000000-0000-0000-0000-000000000308', 8,60000000.00,    1600000.00, 'Or Premium Car',             'Asst. General Manager'),
    ('00000000-0000-0000-0000-000000000309', 9,120000000.00,    3200000.00, 'Or Luxury Car',              'General Manager'),
    ('00000000-0000-0000-0000-000000000310', 10,250000000.00,    6400000.00, 'Or 2BHK Flat',               'Vice President'),
    ('00000000-0000-0000-0000-000000000311', 11,500000000.00,   15000000.00, 'Or Bungalow',                'President'),
    ('00000000-0000-0000-0000-000000000312', 12,1000000000.00,  30000000.00, '+ 5% Profit Share',          'Sales Director')
) AS v(id, lvl, vol, cash, perk, des)
WHERE NOT EXISTS (
    SELECT 1 FROM reward_tier WHERE plan_version_id = '00000000-0000-0000-0000-000000000001'
);
