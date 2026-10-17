package com.plotchain.masterproject;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "master_project")
public class MasterProject {

    public enum Type { PLOT, APARTMENT }
    public enum Status { ACTIVE, SUSPENDED }

    @Id
    private UUID id;
    private String name;
    @Enumerated(EnumType.STRING)
    private Type type;
    private String location;
    private String city;
    private String state;
    @Column(name = "business_percentage")
    private BigDecimal businessPercentage;
    @Column(name = "rate_per_sqft")
    private BigDecimal ratePerSqft;
    @Enumerated(EnumType.STRING)
    private Status status;
    // Plain byte[] without @Lob: see Project.thumbnail.
    @Column(name = "location_map")
    private byte[] locationMap;
    @Column(name = "location_map_content_type")
    private String locationMapContentType;
    @Column(name = "project_map")
    private byte[] projectMap;
    @Column(name = "project_map_content_type")
    private String projectMapContentType;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;

    protected MasterProject() {}

    public MasterProject(UUID id) {
        this.id = id;
        this.status = Status.ACTIVE;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public BigDecimal getBusinessPercentage() { return businessPercentage; }
    public void setBusinessPercentage(BigDecimal businessPercentage) { this.businessPercentage = businessPercentage; }
    public BigDecimal getRatePerSqft() { return ratePerSqft; }
    public void setRatePerSqft(BigDecimal ratePerSqft) { this.ratePerSqft = ratePerSqft; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public byte[] getLocationMap() { return locationMap; }
    public String getLocationMapContentType() { return locationMapContentType; }
    public void setLocationMap(byte[] data, String contentType) { this.locationMap = data; this.locationMapContentType = contentType; }
    public byte[] getProjectMap() { return projectMap; }
    public String getProjectMapContentType() { return projectMapContentType; }
    public void setProjectMap(byte[] data, String contentType) { this.projectMap = data; this.projectMapContentType = contentType; }
    public Instant getCreatedAt() { return createdAt; }
    public void touch() { this.updatedAt = Instant.now(); }
}
