package com.plotchain.projects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "project")
public class Project {

    @Id
    private UUID id;

    @Column(name = "name")
    private String name;

    @Column(name = "location")
    private String location;

    // Plain byte[] with no @Lob: Hibernate 6 maps an unannotated byte[] to VARBINARY, which
    // PostgreSQLDialect renders as bytea, matching the V10 column. @Lob on a byte[] maps to
    // BLOB instead, which Postgres can back with oid large-object semantics -- a mismatch
    // that would fail ddl-auto: validate against a plain BYTEA column. Same reasoning as
    // CompanyBranding.logoSquare.
    @Column(name = "thumbnail")
    private byte[] thumbnail;

    @Column(name = "thumbnail_content_type")
    private String thumbnailContentType;

    @Column(name = "created_at")
    private Instant createdAt;

    protected Project() {}

    public Project(UUID id, String name, String location, byte[] thumbnail, String thumbnailContentType, Instant createdAt) {
        this.id = id;
        this.name = name;
        this.location = location;
        this.thumbnail = thumbnail;
        this.thumbnailContentType = thumbnailContentType;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public byte[] getThumbnail() { return thumbnail; }
    public void setThumbnail(byte[] thumbnail) { this.thumbnail = thumbnail; }

    public String getThumbnailContentType() { return thumbnailContentType; }
    public void setThumbnailContentType(String thumbnailContentType) { this.thumbnailContentType = thumbnailContentType; }

    public Instant getCreatedAt() { return createdAt; }
}
