-- Mandatory-fields change on /admin/sales/new: buyer name, project, price, and a note become the
-- only required fields. plotId and buyerPhone become optional (associateId stays required -- it
-- drives legCredited and the leg-volume rollup feeding Matching/Sponsor Matching/Royalty/Reward
-- income, so it can't go null). price was already stored as `amount`, now client-supplied instead
-- of a Plot.price snapshot -- no column change needed for that one.
ALTER TABLE sale ADD COLUMN project_id UUID REFERENCES project(id);

-- Every existing row has a NOT NULL plot_id today, so this backfill covers 100% of rows before
-- the column is locked down to NOT NULL below.
UPDATE sale SET project_id = (SELECT p.project_id FROM plot p WHERE p.id = sale.plot_id);
ALTER TABLE sale ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE sale ADD COLUMN note VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE sale ALTER COLUMN note DROP DEFAULT;

ALTER TABLE sale ALTER COLUMN plot_id DROP NOT NULL;
ALTER TABLE sale ALTER COLUMN buyer_phone DROP NOT NULL;

CREATE INDEX idx_sale_project_id ON sale(project_id);
