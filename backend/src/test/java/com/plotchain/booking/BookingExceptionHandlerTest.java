package com.plotchain.booking;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BookingExceptionHandlerTest {

    private final BookingExceptionHandler handler = new BookingExceptionHandler();
    private final UUID id = UUID.randomUUID();

    @Test
    void bookingNotFoundIs404() {
        var r = handler.handleBookingNotFound(new BookingNotFoundException(id));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(r.getBody()).containsKey("error");
    }

    @Test
    void plotNotAvailableIs409WithDistinctCodeAndUnchangedErrorText() {
        var ex = new PlotNotAvailableException(id);
        var r = handler.handlePlotNotAvailable(ex);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(r.getBody()).containsEntry("code", "PLOT_NOT_AVAILABLE").containsEntry("error", ex.getMessage());
    }

    @Test
    void bookingNotActiveIs409() {
        assertThat(handler.handleBookingNotActive(new BookingNotActiveException(id)).getStatusCode())
            .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void installmentNotPayableIs409() {
        assertThat(handler.handleInstallmentNotPayable(new InstallmentNotPayableException(id, 2)).getStatusCode())
            .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void installmentNotFoundIs404() {
        assertThat(handler.handleInstallmentNotFound(new InstallmentNotFoundException(id, 9)).getStatusCode())
            .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void sameAssociateTransferIs400() {
        assertThat(handler.handleSameAssociateTransfer(new SameAssociateTransferException(id)).getStatusCode())
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void paymentAmountMismatchIs400() {
        var r = handler.handlePaymentAmountMismatch(
            new PaymentAmountMismatchException(id, 2, new java.math.BigDecimal("100000.00")));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody().get("error")).contains("100000.00");
    }
}
