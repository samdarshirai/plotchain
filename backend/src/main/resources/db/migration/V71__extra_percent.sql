-- Extra Price as a percentage of list price. project.corner_extra_percent is the default for
-- CORNER plots; plot.extra_percent is the per-plot value (extra_price is derived from it).
ALTER TABLE project ADD COLUMN corner_extra_percent NUMERIC(5,2) NOT NULL DEFAULT 10
    CONSTRAINT chk_project_corner_extra_percent CHECK (corner_extra_percent BETWEEN 0 AND 100);
ALTER TABLE plot ADD COLUMN extra_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CONSTRAINT chk_plot_extra_percent CHECK (extra_percent BETWEEN 0 AND 100);
