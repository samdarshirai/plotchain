package com.plotchain.payments;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class PaymentsExceptionHandler {

    @ExceptionHandler(InvalidWithdrawalConfigException.class)
    public ResponseEntity<Map<String, String>> handleInvalidWithdrawalConfig(InvalidWithdrawalConfigException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
