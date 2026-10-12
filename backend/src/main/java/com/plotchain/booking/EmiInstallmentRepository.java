package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
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

    // Admin payments list (U3). ENTERED = unconfirmed queue, PAID = confirmed ledger; date filter is on
    // paid_at (payment date) for both. LEFT JOINs keep rows whose entry-by/confirm-by is NULL (token
    // installments, legacy rows). Pageable must be UNSORTED: order is fixed here.
    @Query(value = """
        SELECT new com.plotchain.booking.PaymentRow(
            b.id, i.installmentNumber, i.paidAt, a.userId, a.name, pr.name, pl.plotNo,
            i.amount, i.paymentMode, i.paymentRef, eb.name, cb.name, i.confirmedAt)
        FROM EmiInstallment i
        JOIN PlotBooking b ON b.id = i.bookingId
        JOIN Associate a ON a.id = b.associateId
        JOIN Plot pl ON pl.id = b.plotId
        JOIN Project pr ON pr.id = pl.projectId
        LEFT JOIN Associate eb ON eb.id = i.recordedBy
        LEFT JOIN Associate cb ON cb.id = i.confirmedBy
        WHERE i.status = :status
        AND (:unbounded = true OR (i.paidAt >= :from AND i.paidAt < :to))
        AND (:projectId IS NULL OR pl.projectId = :projectId)
        ORDER BY i.paidAt DESC NULLS LAST, i.id DESC
        """,
        countQuery = """
        SELECT COUNT(i)
        FROM EmiInstallment i
        JOIN PlotBooking b ON b.id = i.bookingId
        JOIN Associate a ON a.id = b.associateId
        JOIN Plot pl ON pl.id = b.plotId
        JOIN Project pr ON pr.id = pl.projectId
        WHERE i.status = :status
        AND (:unbounded = true OR (i.paidAt >= :from AND i.paidAt < :to))
        AND (:projectId IS NULL OR pl.projectId = :projectId)
        """)
    Page<PaymentRow> findPayments(@Param("status") InstallmentStatus status, @Param("from") Instant from,
        @Param("to") Instant to, @Param("unbounded") boolean unbounded,
        @Param("projectId") UUID projectId, Pageable pageable);

    @Query("""
        SELECT SUM(i.amount)
        FROM EmiInstallment i
        JOIN PlotBooking b ON b.id = i.bookingId
        JOIN Plot pl ON pl.id = b.plotId
        WHERE i.status = :status
        AND (:unbounded = true OR (i.paidAt >= :from AND i.paidAt < :to))
        AND (:projectId IS NULL OR pl.projectId = :projectId)
        """)
    BigDecimal sumPayments(@Param("status") InstallmentStatus status, @Param("from") Instant from,
        @Param("to") Instant to, @Param("unbounded") boolean unbounded,
        @Param("projectId") UUID projectId);
}
