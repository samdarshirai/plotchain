package com.plotchain.announcement;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "announcement")
public class Announcement {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    private String title;
    private String body;
    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;
    private String audience;

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public Instant getPublishedAt() { return publishedAt; }
    public String getAudience() { return audience; }
}
