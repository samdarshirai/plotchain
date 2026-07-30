package com.plotchain.projects;

import java.util.List;

public class CsvImportRejectedException extends RuntimeException {

    private final List<CsvRowError> errors;

    public CsvImportRejectedException(List<CsvRowError> errors) {
        super("CSV import rejected: " + errors.size() + " row error(s) found, nothing was imported");
        this.errors = errors;
    }

    public List<CsvRowError> getErrors() { return errors; }
}
