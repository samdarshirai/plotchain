package com.plotchain.compensation;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// AssociateNotFoundException (thrown by CompensationPlanService#getMyRankProgress) is
// deliberately NOT handled here -- DashboardExceptionHandler already maps it to 404 globally
// (Spring registers every @RestControllerAdvice bean application-wide, not scoped to the
// controller's own package). Adding a second @ExceptionHandler for the same exception type here
// would create a redundant, order-dependent second mapping for the same exception. See
// SalesExceptionHandler's identical header comment for the established precedent. This class
// only owns NoRankAssignedException (compensation's own class, distinct from
// dashboard.NoRankAssignedException) and the two exception types pre-existing in this file.
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

    @ExceptionHandler(NoRankAssignedException.class)
    public ResponseEntity<Map<String, String>> handleNoRankAssigned(NoRankAssignedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
