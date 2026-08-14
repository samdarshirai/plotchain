package com.plotchain.booking;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EmiInstallmentRepository extends JpaRepository<EmiInstallment, UUID> {

    List<EmiInstallment> findByBookingIdOrderByInstallmentNumberAsc(UUID bookingId);
}
