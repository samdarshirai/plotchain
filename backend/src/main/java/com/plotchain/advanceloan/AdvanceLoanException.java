package com.plotchain.advanceloan;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

public class AdvanceLoanException extends RuntimeException {
    private final HttpStatus status;

    public AdvanceLoanException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    HttpStatus status() { return status; }

    @RestControllerAdvice
    static class Handler {
        @ExceptionHandler(AdvanceLoanException.class)
        ResponseEntity<Map<String, String>> handle(AdvanceLoanException ex) {
            return ResponseEntity.status(ex.status).body(Map.of("error", ex.getMessage()));
        }
    }
}
