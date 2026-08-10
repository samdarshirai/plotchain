package com.plotchain.sales;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// PlotNotFoundException (thrown when plotId doesn't resolve) and AssociateNotFoundException
// (thrown when associateId doesn't resolve) are deliberately NOT handled here even though
// SaleService throws both -- ProjectsExceptionHandler and DashboardExceptionHandler already
// map them to 404 globally (Spring registers every @RestControllerAdvice bean application-wide,
// not scoped to the controller's own package). Adding a second @ExceptionHandler for the same
// exception type here would create a redundant, order-dependent second mapping for the same
// exception, so this class only owns the one exception type new to this unit.
@RestControllerAdvice
public class SalesExceptionHandler {

    @ExceptionHandler(PlotNotAvailableException.class)
    public ResponseEntity<Map<String, String>> handlePlotNotAvailable(PlotNotAvailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(SaleNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleSaleNotFound(SaleNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(SaleAlreadyVoidedException.class)
    public ResponseEntity<Map<String, String>> handleSaleAlreadyVoided(SaleAlreadyVoidedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
