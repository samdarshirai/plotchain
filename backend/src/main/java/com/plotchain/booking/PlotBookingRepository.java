package com.plotchain.booking;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
}
