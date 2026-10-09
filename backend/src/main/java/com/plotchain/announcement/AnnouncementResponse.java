package com.plotchain.announcement;

import java.time.Instant;
import java.util.UUID;

// Unit 2's feed maps rows with of(...); audience is intentionally not exposed (spec Decision 2).
public record AnnouncementResponse(UUID id, String title, String body, Instant publishedAt) {
    public static AnnouncementResponse of(Announcement a) {
        return new AnnouncementResponse(a.getId(), a.getTitle(), a.getBody(), a.getPublishedAt());
    }
}
