ALTER TABLE compensation_plan_version DROP CONSTRAINT chk_settlement_cycle;
ALTER TABLE compensation_plan_version ADD CONSTRAINT chk_settlement_cycle
    CHECK (settlement_cycle IN ('SEMI_MONTHLY','MONTHLY','HALF_YEARLY','YEARLY','CUSTOM'));
