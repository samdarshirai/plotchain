-- Payment belongs to income (ledger_entry.status = PAID), not the cycle. Cycles end at CLOSED;
-- a PAID cycle was skipped by the next cycle's carry-forward lookup.
UPDATE cycle SET status = 'CLOSED' WHERE status = 'PAID';
