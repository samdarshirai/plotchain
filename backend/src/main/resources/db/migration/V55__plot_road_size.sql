-- Optional road width (feet) the plot faces.
ALTER TABLE plot ADD COLUMN road_size_ft NUMERIC(8,2) CHECK (road_size_ft IS NULL OR road_size_ft >= 0);
