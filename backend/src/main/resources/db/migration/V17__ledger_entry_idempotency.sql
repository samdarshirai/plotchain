-- Cycle-management unit 5 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
-- Decision #12): source_ref is tightened from nullable (V16, Sales unit 3) to NOT NULL --
-- Postgres does not treat NULL = NULL as a match inside a unique constraint, so a nullable
-- source_ref would silently defeat this guarantee for any income type that ever left it null.
-- Safe to tighten now: every income type that writes ledger_entry rows as of this migration
-- (DIRECT via Sales unit 3, MATCHING via this unit) always sets source_ref to a real row id.
ALTER TABLE ledger_entry ALTER COLUMN source_ref SET NOT NULL;
ALTER TABLE ledger_entry ADD CONSTRAINT uq_ledger_entry_idempotency
    UNIQUE (associate_id, cycle_id, income_type, source_ref);
