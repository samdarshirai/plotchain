package com.plotchain.announcement;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.UUID;

public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {

    // Explicit @Query (not derived) so ordering carries an id tiebreak: two announcements with the
    // same publishedAt must still page deterministically. Same pattern as SupportTicketRepository.searchQueue.
    @Query("""
        SELECT a FROM Announcement a
        ORDER BY a.publishedAt DESC, a.id DESC
        """)
    Page<Announcement> findAllByOrderByPublishedAtDesc(Pageable pageable);
}
