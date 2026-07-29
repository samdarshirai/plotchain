package com.plotchain.dashboard;

import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.cycle.NoOpenCycleException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class DashboardExceptionHandler {

    @ExceptionHandler(AssociateNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotFound(AssociateNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoOpenCycleException.class)
    public ResponseEntity<Map<String, String>> handleNoOpenCycle(NoOpenCycleException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
