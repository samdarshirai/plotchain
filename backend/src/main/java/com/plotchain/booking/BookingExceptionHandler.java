package com.plotchain.booking;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// PlotNotFoundException and AssociateNotFoundException are deliberately NOT handled here even
// though BookingService throws both -- ProjectsExceptionHandler and DashboardExceptionHandler
// already map them to 404 globally (same reasoning SalesExceptionHandler documents for omitting
// the same two types). Adding a second @ExceptionHandler for either here would create a
// redundant, order-dependent second mapping -- exactly the mistake role-capability unit 9's
// pre-merge review caught and removed from CompensationExceptionHandler. This class only owns
// the booking exception types: PlotNotAvailableException plus the ones new to the
// plot-booking-lifecycle spec. AssociateNotFoundException stays handled globally (unit 7
// relies on that).
@RestControllerAdvice
public class BookingExceptionHandler {

    @ExceptionHandler(PlotNotAvailableException.class)
    public ResponseEntity<Map<String, String>> handlePlotNotAvailable(PlotNotAvailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(BookingNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleBookingNotFound(BookingNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(BookingNotActiveException.class)
    public ResponseEntity<Map<String, String>> handleBookingNotActive(BookingNotActiveException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InstallmentNotPayableException.class)
    public ResponseEntity<Map<String, String>> handleInstallmentNotPayable(InstallmentNotPayableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InstallmentNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleInstallmentNotFound(InstallmentNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(SameAssociateTransferException.class)
    public ResponseEntity<Map<String, String>> handleSameAssociateTransfer(SameAssociateTransferException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
}
