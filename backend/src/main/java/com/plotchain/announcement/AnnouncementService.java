package com.plotchain.announcement;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

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

    // page/size arrive already clamped by the controller (PageRequest.of throws on size < 1).
    @Transactional(readOnly = true)
    public AnnouncementPageResponse feed(int page, int size) {
        Page<Announcement> result = announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(page, size));
        return new AnnouncementPageResponse(
            result.getContent().stream().map(AnnouncementResponse::of).toList(),
            page, size, result.getTotalElements());
    }
}
