package com.plotchain.announcement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "announcement")
public class Announcement {

    @Id
    private UUID id;
    private String title;
    private String body;
    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;
    private String audience;

    protected Announcement() {}

    public Announcement(UUID id, String title, String body, Instant publishedAt, String audience) {
        this.id = id;
        this.title = title;
        this.body = body;
        this.publishedAt = publishedAt;
        this.audience = audience;
    }

    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public Instant getPublishedAt() { return publishedAt; }
    public String getAudience() { return audience; }
}
