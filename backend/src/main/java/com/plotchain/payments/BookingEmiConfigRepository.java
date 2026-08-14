package com.plotchain.payments;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BookingEmiConfigRepository extends JpaRepository<BookingEmiConfig, UUID> {

    // Role-capability unit 7: booking-schedule generation needs to read the singleton policy
    // row directly (BookingEmiConfigService.currentConfig(), which does the same lookup via
    // findAll().stream().findFirst(), is private and stays that way -- this is a plain derived
    // query against the same singleton_guard column V14's migration already added for exactly
    // this "there is only ever one row" guarantee).
    Optional<BookingEmiConfig> findBySingletonGuardTrue();
}
