package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface BookingEventRepository extends JpaRepository<BookingEvent, UUID> {
    List<BookingEvent> findByBookingIdOrderByCreatedAtAsc(UUID bookingId);

    // Admin plot-transfers list. Pre-V62 transfers have no old_plot_id snapshot and are skipped.
    // Pageable must be UNSORTED: order is fixed here.
    @Query(value = """
        SELECT new com.plotchain.booking.PlotTransferRow(
            e.createdAt, a.userId, a.name, a.phone, pr.name, np.plotNo, op.plotNo, e.paidAmount, e.restAmount)
        FROM BookingEvent e
        JOIN PlotBooking b ON b.id = e.bookingId
        JOIN Associate a ON a.id = b.associateId
        JOIN Plot np ON np.id = e.newPlotId
        JOIN Plot op ON op.id = e.oldPlotId
        JOIN Project pr ON pr.id = np.projectId
        WHERE e.type = com.plotchain.booking.BookingEventType.PLOT_TRANSFERRED
        AND e.createdAt >= :from AND e.createdAt < :to
        AND (:projectId IS NULL OR np.projectId = :projectId)
        ORDER BY e.createdAt DESC, e.id DESC
        """,
        countQuery = """
        SELECT COUNT(e)
        FROM BookingEvent e
        JOIN Plot np ON np.id = e.newPlotId
        JOIN Plot op ON op.id = e.oldPlotId
        WHERE e.type = com.plotchain.booking.BookingEventType.PLOT_TRANSFERRED
        AND e.createdAt >= :from AND e.createdAt < :to
        AND (:projectId IS NULL OR np.projectId = :projectId)
        """)
    Page<PlotTransferRow> findPlotTransfers(@Param("from") Instant from, @Param("to") Instant to,
        @Param("projectId") UUID projectId, Pageable pageable);
}
