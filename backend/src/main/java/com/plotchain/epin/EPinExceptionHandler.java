package com.plotchain.epin;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// com.plotchain.associate.AssociateNotFoundException (existing, thrown by EPinService.redeem
// on an unknown associateId -- epin-domain unit 3) is already mapped to 404 by the app-wide
// com.plotchain.dashboard.DashboardExceptionHandler -- @RestControllerAdvice beans apply
// across every controller in the application regardless of which package throws the
// exception, so no duplicate handler is added here for it. Same reasoning as
// com.plotchain.sales.SalesExceptionHandler and com.plotchain.withdrawal.WithdrawalExceptionHandler.
@RestControllerAdvice
public class EPinExceptionHandler {

    @ExceptionHandler(EPinNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleEPinNotFound(EPinNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(com.plotchain.associate.AssociateNotPendingException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotPending(
            com.plotchain.associate.AssociateNotPendingException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinNotOwnedException.class)
    public ResponseEntity<Map<String, String>> handleEPinNotOwned(EPinNotOwnedException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinExpiredException.class)
    public ResponseEntity<Map<String, String>> handleEPinExpired(EPinExpiredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinAlreadyRedeemedException.class)
    public ResponseEntity<Map<String, String>> handleEPinAlreadyRedeemed(EPinAlreadyRedeemedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinBlockedException.class)
    public ResponseEntity<Map<String, String>> handleEPinBlocked(EPinBlockedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinInvalidStateException.class)
    public ResponseEntity<Map<String, String>> handleEPinInvalidState(EPinInvalidStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinInsufficientPoolException.class)
    public ResponseEntity<Map<String, String>> handleInsufficientPool(EPinInsufficientPoolException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(com.plotchain.associate.AssociateNotActiveException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotActive(
            com.plotchain.associate.AssociateNotActiveException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
