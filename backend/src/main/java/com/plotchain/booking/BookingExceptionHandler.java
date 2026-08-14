package com.plotchain.booking;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// PlotNotFoundException and AssociateNotFoundException are deliberately NOT handled here even
// though BookingService throws both -- ProjectsExceptionHandler and DashboardExceptionHandler
// already map them to 404 globally (same reasoning SalesExceptionHandler documents for omitting
// the same two types). Adding a second @ExceptionHandler for either here would create a
// redundant, order-dependent second mapping -- exactly the mistake role-capability unit 9's
// pre-merge review caught and removed from CompensationExceptionHandler. This class only owns
// the one exception type new to this unit.
@RestControllerAdvice
public class BookingExceptionHandler {

    @ExceptionHandler(PlotNotAvailableException.class)
    public ResponseEntity<Map<String, String>> handlePlotNotAvailable(PlotNotAvailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
