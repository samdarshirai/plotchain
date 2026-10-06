package com.plotchain.supportticket;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

// Unit 4 adds findByAssociateId...OrderByCreatedAtDesc (own-history) beside searchQueue.
public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {

    // Admin queue (support-tickets unit 2). Both filters are independently optional (null = don't
    // filter), the searchDirectory / PlotBookingRepository.search shape, not four derived methods.
    // Plain (:p IS NULL OR ...) with no CAST: UUID and enum nulls bind fine on real Postgres
    // (verified in plot-booking unit 8, 2026-10-05); only String/Instant nulls need a CAST. Order is
    // fixed here (createdAt DESC, id DESC tiebreak) so callers pass an UNSORTED Pageable; the count
    // query is derived from this one.
    @Query("""
        SELECT t FROM SupportTicket t
        WHERE (:status IS NULL OR t.status = :status)
        AND (:associateId IS NULL OR t.associateId = :associateId)
        ORDER BY t.createdAt DESC, t.id DESC
        """)
    Page<SupportTicket> searchQueue(
        @Param("status") SupportTicketStatus status,
        @Param("associateId") UUID associateId,
        Pageable pageable);
}
