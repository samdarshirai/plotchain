package com.plotchain.projects;

public record CsvRowError(int rowNumber, String field, String message) {}
