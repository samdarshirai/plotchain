ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier1_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier1_sqft_threshold NUMERIC(10,2) NOT NULL DEFAULT 2000;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier2_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier2_sqft_threshold NUMERIC(10,2) NOT NULL DEFAULT 3000;

CREATE TABLE self_performance_bonus_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_self_performance_bonus_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_self_performance_bonus_config_singleton UNIQUE (singleton_guard)
);

INSERT INTO self_performance_bonus_config (id, singleton_guard, enabled, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, FALSE, CURRENT_TIMESTAMP);
