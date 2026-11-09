-- batch_id becomes a 5-digit number; each legacy UUID batch gets a distinct one.
ALTER TABLE epin ADD COLUMN batch_no INTEGER;
UPDATE epin e SET batch_no = m.n
FROM (SELECT batch_id, 9999 + dense_rank() OVER (ORDER BY batch_id) AS n FROM epin) m
WHERE e.batch_id = m.batch_id;
DROP INDEX idx_epin_batch_id;
ALTER TABLE epin DROP COLUMN batch_id;
ALTER TABLE epin RENAME COLUMN batch_no TO batch_id;
ALTER TABLE epin ALTER COLUMN batch_id SET NOT NULL;
CREATE INDEX idx_epin_batch_id ON epin(batch_id);
