package com.plotchain.booking;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface EmiInstallmentRepository extends JpaRepository<EmiInstallment, UUID> {

    List<EmiInstallment> findByBookingIdOrderByInstallmentNumberAsc(UUID bookingId);

    // One query for a whole register page (avoids the per-booking N+1 in getMyBookings).
    // Ordered by number so each booking's group is already in schedule order.
    List<EmiInstallment> findByBookingIdInOrderByInstallmentNumberAsc(Collection<UUID> bookingIds);

    // Associate EMI report: PAID installments on the caller's own bookings, paid_at in [from, to).
    @Query("""
        SELECT new com.plotchain.booking.EmiReportRow(a.userId, a.name, i.paidAt, i.amount, i.paymentRef)
        FROM EmiInstallment i
        JOIN PlotBooking b ON b.id = i.bookingId
        JOIN Associate a ON a.id = b.associateId
        WHERE b.associateId = :associateId AND i.status = com.plotchain.booking.InstallmentStatus.PAID
        AND i.paidAt >= :from AND i.paidAt < :to
        ORDER BY i.paidAt, i.id
        """)
    List<EmiReportRow> findEmiReport(@Param("associateId") UUID associateId, @Param("from") Instant from, @Param("to") Instant to);
}
