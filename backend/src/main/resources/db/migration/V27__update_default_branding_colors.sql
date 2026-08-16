-- V7's seeded company_branding row still carried the pre-rebrand generic SaaS defaults
-- (#7C3AED violet / #22D3EE cyan). Frontend's _tokens.scss :root defaults were updated to the
-- Viraj Acres "Legacy Living" palette (see repo-root DESIGN.md's Antique Gold/Oxblood) but V7's
-- INSERT was never edited to match -- Flyway migrations that already ran must not be edited in
-- place, so the correction lands as its own UPDATE instead. A company that never customized its
-- branding (no admin PUT to /api/company/branding yet) will now start on the documented default
-- colors instead of the stale generic ones.
UPDATE company_branding
SET primary_color = '#C6A227', secondary_color = '#5C1A2A'
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND primary_color = '#7C3AED'
  AND secondary_color = '#22D3EE';
