package com.plotchain.booking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.UUID;

// One-off: credits business/income for payments confirmed before it was credited per payment.
// Idempotent (only PAID installments with no Sale are touched), so it is a no-op after the first run.
// ponytail: delete this class, backfillPaymentSales and the two EmiInstallmentRepository queries
// once every environment has started once on this version.
@Component
public class BookingSaleBackfill implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BookingSaleBackfill.class);

    private final EmiInstallmentRepository emiInstallmentRepository;
    private final BookingService bookingService;

    public BookingSaleBackfill(EmiInstallmentRepository emiInstallmentRepository, BookingService bookingService) {
        this.emiInstallmentRepository = emiInstallmentRepository;
        this.bookingService = bookingService;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (UUID bookingId : emiInstallmentRepository.findBookingIdsWithUncreditedPayments()) {
            try {
                bookingService.backfillPaymentSales(bookingId);
                log.info("Backfilled payment sales for booking {}", bookingId);
            } catch (RuntimeException e) {
                // A bad booking must never keep the app from starting; it is retried on next start.
                log.error("Payment-sale backfill failed for booking {}", bookingId, e);
            }
        }
    }
}
