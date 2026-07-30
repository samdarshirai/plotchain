CREATE TABLE project (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(255) NOT NULL,
    thumbnail BYTEA,
    thumbnail_content_type VARCHAR(64),
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE plot (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES project(id),
    plot_no VARCHAR(32) NOT NULL,
    plot_type VARCHAR(8) NOT NULL,
    area_sqft NUMERIC(14,2) NOT NULL,
    rate NUMERIC(14,2) NOT NULL,
    price NUMERIC(14,2) NOT NULL,
    status VARCHAR(16) NOT NULL,
    CONSTRAINT chk_plot_type CHECK (plot_type IN ('NORMAL','CORNER')),
    CONSTRAINT chk_plot_status CHECK (status IN ('AVAILABLE','BOOKED','SOLD')),
    UNIQUE (project_id, plot_no)
);
CREATE INDEX idx_plot_project_status ON plot(project_id, status);
