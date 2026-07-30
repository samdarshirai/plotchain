-- Backs the setup wizard's derived-completeness API (GET /api/company/setup-state) and the
-- Go Live gate (POST /api/company/launch). Singleton table: exactly one row, enforced by the
-- database rather than application discipline.
CREATE TABLE setup_state (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    terms_accepted_at TIMESTAMP,
    launched_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_setup_state_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_setup_state_singleton UNIQUE (singleton_guard)
);

-- Seeded here, not lazily created by application code, so SetupStateService can always assume
-- exactly one row exists.
INSERT INTO setup_state (id, singleton_guard, terms_accepted_at, launched_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, NULL, NULL, CURRENT_TIMESTAMP);
