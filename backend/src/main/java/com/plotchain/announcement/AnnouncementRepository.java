package com.plotchain.announcement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Unit 2 appends: Page<Announcement> findAllByOrderByPublishedAtDesc(Pageable pageable);
public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {}
