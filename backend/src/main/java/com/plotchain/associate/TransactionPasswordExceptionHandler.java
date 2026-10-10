package com.plotchain.associate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class TransactionPasswordExceptionHandler {

    @ExceptionHandler(TransactionPasswordNotSetException.class)
    public ResponseEntity<Map<String, String>> handleNotSet(TransactionPasswordNotSetException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", ex.getMessage(), "code", "TRANSACTION_PASSWORD_NOT_SET"));
    }

    @ExceptionHandler(TransactionPasswordLockedException.class)
    public ResponseEntity<Map<String, String>> handleLocked(TransactionPasswordLockedException ex) {
        return ResponseEntity.status(HttpStatus.LOCKED).body(Map.of(
            "error", ex.getMessage(),
            "code", "TRANSACTION_PASSWORD_LOCKED",
            "lockedUntil", ex.getLockedUntil().toString()));
    }
}
