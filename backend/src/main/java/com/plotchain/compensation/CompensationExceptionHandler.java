package com.plotchain.compensation;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CompensationExceptionHandler {

    @ExceptionHandler(RewardTierGapException.class)
    public ResponseEntity<Map<String, String>> handleRewardTierGap(RewardTierGapException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
