package com.plotchain.masterproject;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

public class MasterProjectException extends RuntimeException {
    private final HttpStatus status;

    public MasterProjectException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    @RestControllerAdvice
    static class Handler {
        @ExceptionHandler(MasterProjectException.class)
        ResponseEntity<Map<String, String>> handle(MasterProjectException ex) {
            return ResponseEntity.status(ex.status).body(Map.of("error", ex.getMessage()));
        }
    }
}
