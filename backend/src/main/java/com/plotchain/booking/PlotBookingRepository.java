package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PlotBookingRepository extends JpaRepository<PlotBooking, UUID> {

    // Role-capability unit 7 ("Associate own view -- GET /api/associates/me/bookings"): the
    // matrix's Plot/project inventory row gives an Associate "own bookings + EMI schedule", not
    // "own + descendant" like the Sales row's "team-volume reports" wording -- so, unlike
    // SaleRepository.findByAssociateIdInOrderByRecordedAtDesc, this takes a single associateId,
    // never a self-plus-downline ID list.
    Page<PlotBooking> findByAssociateIdOrderByBookedAtDesc(UUID associateId, Pageable pageable);
}
