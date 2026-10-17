package com.plotchain.news;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record NewsResponse(UUID id, LocalDate newsDate, String title, String body, Instant createdAt) {
    static NewsResponse of(News n) {
        return new NewsResponse(n.getId(), n.getNewsDate(), n.getTitle(), n.getBody(), n.getCreatedAt());
    }
}
