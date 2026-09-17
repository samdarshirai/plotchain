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

    @ExceptionHandler(EPinAlreadyRedeemedException.class)
    public ResponseEntity<Map<String, String>> handleEPinAlreadyRedeemed(EPinAlreadyRedeemedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
