package com.plotchain.projects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ProjectsExceptionHandler {

    @ExceptionHandler(ProjectNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleProjectNotFound(ProjectNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(PlotNotFoundException.class)
    public ResponseEntity<Map<String, String>> handlePlotNotFound(PlotNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidThumbnailUploadException.class)
    public ResponseEntity<Map<String, String>> handleInvalidThumbnailUpload(InvalidThumbnailUploadException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(ProjectHasPlotsException.class)
    public ResponseEntity<Map<String, String>> handleProjectHasPlots(ProjectHasPlotsException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(DuplicatePlotNumberException.class)
    public ResponseEntity<Map<String, String>> handleDuplicatePlotNumber(DuplicatePlotNumberException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(CsvImportRejectedException.class)
    public ResponseEntity<Map<String, Object>> handleCsvImportRejected(CsvImportRejectedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", ex.getMessage(), "errors", ex.getErrors()));
    }
}
