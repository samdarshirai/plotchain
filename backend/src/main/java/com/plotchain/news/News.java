package com.plotchain.news;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "news")
public class News {

    @Id
    private UUID id;
    @Column(name = "news_date")
    private LocalDate newsDate;
    private String title;
    private String body;
    @Column(name = "created_at")
    private Instant createdAt;

    protected News() {}

    public News(UUID id, LocalDate newsDate, String title, String body) {
        this.id = id;
        this.newsDate = newsDate;
        this.title = title;
        this.body = body;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public LocalDate getNewsDate() { return newsDate; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public Instant getCreatedAt() { return createdAt; }
}
