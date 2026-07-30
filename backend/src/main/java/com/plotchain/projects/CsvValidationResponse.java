package com.plotchain.projects;

import java.util.List;

public record CsvValidationResponse(int totalRows, int validRows, List<CsvRowError> errors) {}
