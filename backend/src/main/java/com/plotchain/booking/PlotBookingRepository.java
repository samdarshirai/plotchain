package com.plotchain.booking;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface PlotBookingRepository extends JpaRepository<PlotBooking, UUID> {

    // Role-capability unit 7 ("Associate own view -- GET /api/associates/me/bookings"): the
    // matrix's Plot/project inventory row gives an Associate "own bookings + EMI schedule", not
    // "own + descendant" like the Sales row's "team-volume reports" wording -- so, unlike
    // SaleRepository.findByAssociateIdInOrderByRecordedAtDesc, this takes a single associateId,
    // never a self-plus-downline ID list.
    Page<PlotBooking> findByAssociateIdOrderByBookedAtDesc(UUID associateId, Pageable pageable);

    // Same pessimistic-lock pattern as PlotRepository.findByIdForUpdate: must be the first statement
    // of the @Transactional pay/confirm/cancel/transfer methods (Decision 8); empty Optional doubles
    // as the "booking not found" check.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM PlotBooking b WHERE b.id = :id")
    Optional<PlotBooking> findByIdForUpdate(@Param("id") UUID id);

    // Unit 6 stale-booking guard: is there ANOTHER booking in the given statuses on this plot?
    // Derived query (plotId, id, status are all mapped fields). Must be called under the plot row lock.
    Optional<PlotBooking> findFirstByPlotIdAndIdNotAndStatusIn(
        UUID plotId, UUID excludedBookingId, Collection<BookingStatus> statuses);

    // Admin register (plot-booking unit 8). Null-safe optional filters, same JPQL pattern as
    // EPinRepository.search. project_id lives on plot, so projectId is an EXISTS (no join => no
    // duplicate rows); overdue is EXISTS too, restricted to ACTIVE bookings (Resolved decision #5).
    // `today` is always non-null; `overdueOnly` is a primitive so no null-typed boolean binding.
    // Sort comes from the Pageable (booked_at DESC, id DESC); the count query is derived from this one.
    @Query("""
        SELECT b FROM PlotBooking b
        WHERE (:status IS NULL OR b.status = :status)
        AND (:associateId IS NULL OR b.associateId = :associateId)
        AND (:plotId IS NULL OR b.plotId = :plotId)
        AND (:projectId IS NULL OR EXISTS (SELECT 1 FROM Plot p WHERE p.id = b.plotId AND p.projectId = :projectId))
        AND (:overdueOnly = false OR (b.status = com.plotchain.booking.BookingStatus.ACTIVE
        """
        + " AND " + BookingOverdue.EXISTS_OVERDUE + "))")
    Page<PlotBooking> search(
        @Param("status") BookingStatus status,
        @Param("associateId") UUID associateId,
        @Param("plotId") UUID plotId,
        @Param("projectId") UUID projectId,
        @Param("overdueOnly") boolean overdueOnly,
        @Param("today") LocalDate today,
        Pageable pageable);

    // Associate "Team / Left / Right plot bookings": bookings made by anyone in the caller's downline.
    // position null = whole team, 'L'/'R' = that leg only (CTE seeded at the immediate child on that
    // leg, same shape as AssociateRepository.countDownlineByPosition). Order is fixed in SQL, so the
    // Pageable must be UNSORTED.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
              AND (CAST(:position AS text) IS NULL OR position = CAST(:position AS text))
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT b.* FROM plot_booking b JOIN downline d ON b.associate_id = d.id
        ORDER BY b.booked_at DESC, b.id DESC
        """,
        countQuery = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
              AND (CAST(:position AS text) IS NULL OR position = CAST(:position AS text))
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM plot_booking b JOIN downline d ON b.associate_id = d.id
        """,
        nativeQuery = true)
    Page<PlotBooking> findByDownline(@Param("associateId") UUID associateId, @Param("position") String position, Pageable pageable);

    // Admin overdue-EMI report (plot-booking unit 9): one grouped query, one row per ACTIVE booking.
    // Overdue comes from unit 8's BookingOverdue.INSTALLMENT_CONDITION (alias contract b, i, :today);
    // do not combine with EXISTS_OVERDUE (both alias `i`). The fragments carry no ACTIVE restriction,
    // so it is added here. Pageable must be UNSORTED: order is fixed here (oldest overdue due date,
    // bookedAt, id) so page boundaries are deterministic. The count query counts BOOKINGS, not rows.
    @Query(value = """
        SELECT new com.plotchain.booking.OverdueReportRow(
            b.id, b.plotId, p.plotNo, b.associateId, a.name, b.buyerName,
            COUNT(i), SUM(i.amount), MIN(i.dueDate))
        FROM PlotBooking b
        JOIN EmiInstallment i ON i.bookingId = b.id
        JOIN Associate a ON a.id = b.associateId
        JOIN Plot p ON p.id = b.plotId
        WHERE b.status = com.plotchain.booking.BookingStatus.ACTIVE AND
        """
        + BookingOverdue.INSTALLMENT_CONDITION + """

        GROUP BY b.id, b.plotId, p.plotNo, b.associateId, a.name, b.buyerName, b.bookedAt
        ORDER BY MIN(i.dueDate) ASC, b.bookedAt ASC, b.id ASC
        """,
        countQuery = """
        SELECT COUNT(DISTINCT b.id)
        FROM PlotBooking b
        JOIN EmiInstallment i ON i.bookingId = b.id
        WHERE b.status = com.plotchain.booking.BookingStatus.ACTIVE AND
        """
        + BookingOverdue.INSTALLMENT_CONDITION)
    Page<OverdueReportRow> findOverdueReport(@Param("today") LocalDate today, Pageable pageable);
}
