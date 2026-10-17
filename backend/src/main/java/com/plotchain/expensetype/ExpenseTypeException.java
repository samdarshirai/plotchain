package com.plotchain.expensetype;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

public class ExpenseTypeException extends RuntimeException {
    private final HttpStatus status;

    public ExpenseTypeException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    @RestControllerAdvice
    static class Handler {
        @ExceptionHandler(ExpenseTypeException.class)
        ResponseEntity<Map<String, String>> handle(ExpenseTypeException ex) {
            return ResponseEntity.status(ex.status).body(Map.of("error", ex.getMessage()));
        }
    }
}
