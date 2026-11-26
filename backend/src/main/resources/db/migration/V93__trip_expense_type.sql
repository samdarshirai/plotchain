-- System-created expense type "Trip Expense": always present, not editable (system = TRUE).
INSERT INTO expense_type (id, name, status, system)
SELECT gen_random_uuid(), 'Trip Expense', 'ACTIVE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM expense_type WHERE lower(name) = 'trip expense');
UPDATE expense_type SET system = TRUE WHERE lower(name) = 'trip expense';
