package com.plotchain.booking;

import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

// Pre-token tests assert on a schedule whose installments are all PENDING and equal (price / count).
// Booking now takes a token as installment 1, already PAID. A token of price / count makes the
// amounts identical to the old schedule; flipping installment 1 back to PENDING restores the rest of
// the old shape, so those lifecycle tests keep testing pay / confirm / cancel / transfer, not tokens.
// Token behaviour itself is covered in BookingServiceTest.
final class LegacyScheduleSeed {
    private LegacyScheduleSeed() {}

    static BookingResponse book(BookingService bookingService, JdbcTemplate jdbc,
                                UUID plotId, UUID associateId, String buyerName) {
        BigDecimal price = jdbc.queryForObject("SELECT price FROM plot WHERE id = ?", BigDecimal.class, plotId);
        Boolean emi = jdbc.queryForObject("SELECT emi_enabled FROM booking_emi_config", Boolean.class);
        Integer configured = jdbc.queryForObject("SELECT default_installment_count FROM booking_emi_config", Integer.class);
        int count = Boolean.TRUE.equals(emi) ? Math.max(configured, 2) : 2;
        BigDecimal token = price.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);
        BookingResponse created = bookingService.createBooking(
            new CreateBookingRequest(plotId, associateId, buyerName, null, token));
        jdbc.update("UPDATE emi_installment SET status = 'PENDING', paid_at = NULL, payment_ref = NULL "
            + "WHERE booking_id = ? AND installment_number = 1", created.id());
        if (!Boolean.TRUE.equals(emi)) {
            // EMI off used to mean one installment for the full price: collapse token + balance into it.
            jdbc.update("DELETE FROM emi_installment WHERE booking_id = ? AND installment_number = 1", created.id());
            jdbc.update("UPDATE emi_installment SET installment_number = 1, amount = ? WHERE booking_id = ?", price, created.id());
            jdbc.update("UPDATE plot_booking SET installment_count = 1 WHERE id = ?", created.id());
        }
        return bookingService.getBooking(created.id());
    }
}
