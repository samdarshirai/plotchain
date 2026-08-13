package com.plotchain.compensation;

import com.plotchain.associate.AssociateNotFoundException;
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

    @ExceptionHandler(DuplicateEffectiveDateException.class)
    public ResponseEntity<Map<String, String>> handleDuplicateEffectiveDate(DuplicateEffectiveDateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(AssociateNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotFound(AssociateNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoRankAssignedException.class)
    public ResponseEntity<Map<String, String>> handleNoRankAssigned(NoRankAssignedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
