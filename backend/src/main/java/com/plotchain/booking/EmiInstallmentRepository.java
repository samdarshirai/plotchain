package com.plotchain.booking;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface EmiInstallmentRepository extends JpaRepository<EmiInstallment, UUID> {

    List<EmiInstallment> findByBookingIdOrderByInstallmentNumberAsc(UUID bookingId);

    // One query for a whole register page (avoids the per-booking N+1 in getMyBookings).
    // Ordered by number so each booking's group is already in schedule order.
    List<EmiInstallment> findByBookingIdInOrderByInstallmentNumberAsc(Collection<UUID> bookingIds);
}
