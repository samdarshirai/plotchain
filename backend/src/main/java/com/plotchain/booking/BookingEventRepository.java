package com.plotchain.booking;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BookingEventRepository extends JpaRepository<BookingEvent, UUID> {
    List<BookingEvent> findByBookingIdOrderByCreatedAtAsc(UUID bookingId);
}
