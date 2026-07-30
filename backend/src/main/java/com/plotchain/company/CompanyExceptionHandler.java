package com.plotchain.company;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CompanyExceptionHandler {

    @ExceptionHandler(LaunchBlockedException.class)
    public ResponseEntity<Map<String, Object>> handleLaunchBlocked(LaunchBlockedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", ex.getMessage(), "incompleteSteps", ex.getIncompleteSteps()));
    }
}
