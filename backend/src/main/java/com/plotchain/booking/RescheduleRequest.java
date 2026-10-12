package com.plotchain.booking;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record RescheduleRequest(
    @Min(1) @Max(RescheduleRequest.MAX_COUNT) int installmentCount,
    @NotNull LocalDate firstDueDate
) {
    public static final int MAX_COUNT = 60; // 5 years monthly; no pre-existing limit
}
