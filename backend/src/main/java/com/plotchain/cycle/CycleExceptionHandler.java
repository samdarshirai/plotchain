package com.plotchain.cycle;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CycleExceptionHandler {

    @ExceptionHandler(CycleNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleCycleNotFound(CycleNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(CycleAlreadyClosedException.class)
    public ResponseEntity<Map<String, String>> handleCycleAlreadyClosed(CycleAlreadyClosedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
