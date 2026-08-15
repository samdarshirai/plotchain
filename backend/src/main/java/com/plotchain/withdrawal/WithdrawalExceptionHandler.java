package com.plotchain.withdrawal;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// com.plotchain.associate.AssociateNotFoundException (existing, thrown by WithdrawalService on
// an unknown associateId) is already mapped to 404 by the app-wide
// com.plotchain.dashboard.DashboardExceptionHandler -- @RestControllerAdvice beans apply across
// every controller in the application regardless of which package throws the exception, so no
// duplicate handler is added here for it.
@RestControllerAdvice
public class WithdrawalExceptionHandler {

    @ExceptionHandler(AssociateSuspendedException.class)
    public ResponseEntity<Map<String, String>> handleAssociateSuspended(AssociateSuspendedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(KycNotVerifiedException.class)
    public ResponseEntity<Map<String, String>> handleKycNotVerified(KycNotVerifiedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(BelowMinimumWithdrawalException.class)
    public ResponseEntity<Map<String, String>> handleBelowMinimumWithdrawal(BelowMinimumWithdrawalException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InsufficientWalletBalanceException.class)
    public ResponseEntity<Map<String, String>> handleInsufficientWalletBalance(InsufficientWalletBalanceException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
