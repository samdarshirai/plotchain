package com.plotchain.booking;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
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
    // Date and q filters (U3): Instant/String params are never null (service passes sentinels and ""), since
    // Postgres cannot type a null parameter. q = lowercased substring of associate login id or plot no;
    // ponytail: % and _ in q act as LIKE wildcards (unescaped), escape if exact matching ever matters.
    // TEXT-BLOCK TRAP: the first text block ends mid-clause and is concatenated with BookingOverdue below,
    // so new predicates go ABOVE the :overdueOnly line, never after the concatenation.
    // Sort comes from the Pageable (booked_at DESC, id DESC); the count query is derived from this one.
    @Query("""
        SELECT b FROM PlotBooking b
        WHERE (:status IS NULL OR b.status = :status)
        AND (:associateId IS NULL OR b.associateId = :associateId)
        AND (:plotId IS NULL OR b.plotId = :plotId)
        AND (:projectId IS NULL OR EXISTS (SELECT 1 FROM Plot p WHERE p.id = b.plotId AND p.projectId = :projectId))
        AND b.bookedAt >= :bookedFrom AND b.bookedAt < :bookedTo
        AND (:cancelledFilter = false OR (b.cancelledAt >= :cancelledFrom AND b.cancelledAt < :cancelledTo))
        AND (:q = '' OR EXISTS (SELECT 1 FROM Associate qa WHERE qa.id = b.associateId AND LOWER(qa.userId) LIKE CONCAT('%', :q, '%'))
             OR EXISTS (SELECT 1 FROM Plot qp WHERE qp.id = b.plotId AND LOWER(qp.plotNo) LIKE CONCAT('%', :q, '%')))
        AND (:pendingOnly = false OR (b.status = com.plotchain.booking.BookingStatus.ACTIVE AND EXISTS (SELECT 1 FROM EmiInstallment pi WHERE pi.bookingId = b.id AND pi.status = com.plotchain.booking.InstallmentStatus.PENDING)))
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
        @Param("bookedFrom") Instant bookedFrom,
        @Param("bookedTo") Instant bookedTo,
        @Param("cancelledFilter") boolean cancelledFilter,
        @Param("cancelledFrom") Instant cancelledFrom,
        @Param("cancelledTo") Instant cancelledTo,
        @Param("q") String q,
        @Param("pendingOnly") boolean pendingOnly,
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

    // "My Business Datewise": same downline CTE as findByDownline, restricted to booked_at in [from, to).
    // position is 'L' or 'R'. CANCELLED bookings are not business.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId AND position = CAST(:position AS text)
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT b.* FROM plot_booking b JOIN downline d ON b.associate_id = d.id
        WHERE b.status <> 'CANCELLED' AND b.booked_at >= :from AND b.booked_at < :to
        ORDER BY b.booked_at, b.id
        """, nativeQuery = true)
    List<PlotBooking> findByDownlineBetween(@Param("associateId") UUID associateId, @Param("position") String position,
                                            @Param("from") Instant from, @Param("to") Instant to);
}
