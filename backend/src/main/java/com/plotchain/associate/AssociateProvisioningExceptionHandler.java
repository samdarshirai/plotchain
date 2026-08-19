package com.plotchain.associate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class AssociateProvisioningExceptionHandler {

    @ExceptionHandler(EmailAlreadyRegisteredException.class)
    public ResponseEntity<Map<String, String>> handleEmailTaken(EmailAlreadyRegisteredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(PlacementUnavailableException.class)
    public ResponseEntity<Map<String, String>> handlePlacementTaken(PlacementUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(PositionRequiredException.class)
    public ResponseEntity<Map<String, String>> handlePositionRequired(PositionRequiredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoRankTiersConfiguredException.class)
    public ResponseEntity<Map<String, String>> handleNoRanks(NoRankTiersConfiguredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidKycDecisionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidKycDecision(InvalidKycDecisionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidKycUploadException.class)
    public ResponseEntity<Map<String, String>> handleInvalidKycUpload(InvalidKycUploadException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoRankAssignedException.class)
    public ResponseEntity<Map<String, String>> handleNoRankAssigned(NoRankAssignedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
