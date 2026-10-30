-- Park Facing / Road Side plot types. Per-project default Extra % for each (stacked on top of the
-- corner % for the CORNER_* combinations by the UI); plot_type widened for the combination names.
ALTER TABLE project ADD COLUMN park_facing_extra_percent NUMERIC(5,2) NOT NULL DEFAULT 5
    CONSTRAINT chk_project_park_facing_extra_percent CHECK (park_facing_extra_percent BETWEEN 0 AND 100);
ALTER TABLE project ADD COLUMN road_side_extra_percent NUMERIC(5,2) NOT NULL DEFAULT 5
    CONSTRAINT chk_project_road_side_extra_percent CHECK (road_side_extra_percent BETWEEN 0 AND 100);
ALTER TABLE plot ALTER COLUMN plot_type TYPE VARCHAR(20);
ALTER TABLE plot DROP CONSTRAINT chk_plot_type;
ALTER TABLE plot ADD CONSTRAINT chk_plot_type
    CHECK (plot_type IN ('NORMAL','CORNER','PARK_FACING','ROAD_SIDE','CORNER_PARK_FACING','CORNER_ROAD_SIDE'));
