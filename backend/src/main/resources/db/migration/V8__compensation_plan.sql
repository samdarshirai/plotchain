CREATE TABLE compensation_plan_version (
    id UUID PRIMARY KEY,
    version_label VARCHAR(16) NOT NULL,
    effective_from DATE NOT NULL,
    direct_income_pct NUMERIC(5,2) NOT NULL,
    matching_income_pct NUMERIC(5,2) NOT NULL,
    sponsor_matching_pct NUMERIC(5,2) NOT NULL,
    tds_pct NUMERIC(5,2) NOT NULL,
    admin_charge_with_pan_pct NUMERIC(5,2) NOT NULL,
    admin_charge_without_pan_pct NUMERIC(5,2) NOT NULL,
    activation_fee NUMERIC(14,2) NOT NULL,
    min_withdrawal NUMERIC(14,2) NOT NULL,
    settlement_cycle VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    created_by_associate_id UUID REFERENCES associate(id),
    CONSTRAINT chk_settlement_cycle CHECK (settlement_cycle IN ('SEMI_MONTHLY','MONTHLY','CUSTOM'))
);
CREATE UNIQUE INDEX idx_compensation_plan_version_effective_from ON compensation_plan_version(effective_from);

CREATE TABLE royalty_bonus_rate (
    id UUID PRIMARY KEY,
    plan_version_id UUID NOT NULL REFERENCES compensation_plan_version(id),
    rank_id UUID NOT NULL REFERENCES rank_tier(id),
    royalty_pct NUMERIC(5,2) NOT NULL,
    UNIQUE (plan_version_id, rank_id)
);
CREATE INDEX idx_royalty_bonus_rate_plan_version_id ON royalty_bonus_rate(plan_version_id);

CREATE TABLE reward_tier (
    id UUID PRIMARY KEY,
    plan_version_id UUID NOT NULL REFERENCES compensation_plan_version(id),
    tier_level INT NOT NULL,
    volume_threshold NUMERIC(14,2) NOT NULL,
    cash_reward NUMERIC(14,2) NOT NULL,
    perk_description VARCHAR(255),
    UNIQUE (plan_version_id, tier_level)
);
CREATE INDEX idx_reward_tier_plan_version_id ON reward_tier(plan_version_id);

ALTER TABLE cycle ADD COLUMN compensation_plan_version_id UUID REFERENCES compensation_plan_version(id);

-- Genesis version, effective far in the past so it never collides with the unique index if an
-- admin edits the plan the same day this migration runs. matching_income_pct=7.00 reproduces
-- today's hardcoded compensation.preview-matching-rate:0.07 (Task 9 retires the @Value in favor
-- of this row) so behavior is unchanged on deploy. tds_pct/admin_charge_*/activation_fee/
-- settlement_cycle are the spec's stated Indian-market defaults (setup-onboarding-spec.md lines
-- 61-65). direct_income_pct/sponsor_matching_pct/min_withdrawal are NOT specified anywhere in the
-- spec or PRD — placeholders pending product confirmation.
INSERT INTO compensation_plan_version (
    id, version_label, effective_from, direct_income_pct, matching_income_pct, sponsor_matching_pct,
    tds_pct, admin_charge_with_pan_pct, admin_charge_without_pan_pct, activation_fee, min_withdrawal,
    settlement_cycle, created_at, created_by_associate_id
) VALUES (
    '00000000-0000-0000-0000-000000000001', 'v1', DATE '2000-01-01',
    10.00, 7.00, 5.00, 2.00, 5.00, 15.00, 1100.00, 500.00,
    'SEMI_MONTHLY', CURRENT_TIMESTAMP, NULL
);

UPDATE cycle SET compensation_plan_version_id = '00000000-0000-0000-0000-000000000001'
WHERE compensation_plan_version_id IS NULL;
