package com.plotchain.supportticket;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// Shell created in unit 1 so the per-package advice convention is in place; unit 3 added the
// SupportTicketNotFoundException -> 404 and InvalidSupportTicketResponseException -> 400
// handlers. AssociateNotFoundException (thrown by create()) is deliberately NOT handled here:
// DashboardExceptionHandler already maps it to 404 globally, and a second mapping would be a
// redundant, order-dependent duplicate (see BookingExceptionHandler's header comment).
@RestControllerAdvice
public class SupportTicketExceptionHandler {

    @ExceptionHandler(SupportTicketNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(SupportTicketNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidSupportTicketResponseException.class)
    public ResponseEntity<Map<String, String>> handleInvalidResponse(InvalidSupportTicketResponseException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
}
