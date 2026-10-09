package com.plotchain.announcement;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

// Unit 2 adds feed(page, size) here.
@Service
public class AnnouncementService {

    private final AnnouncementRepository announcementRepository;

    public AnnouncementService(AnnouncementRepository announcementRepository) {
        this.announcementRepository = announcementRepository;
    }

    public AnnouncementResponse compose(CreateAnnouncementRequest request) {
        Announcement saved = announcementRepository.save(
            new Announcement(UUID.randomUUID(), request.title(), request.body(), Instant.now(), "ALL"));
        return AnnouncementResponse.of(saved);
    }
}
