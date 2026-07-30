package com.plotchain.projects;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

// status is nullable: PlotCsvService and manual creation both default a blank status to
// AVAILABLE in the service layer, matching CompensationPlanRequest's settlementCycle pattern
// of validating the string shape here and resolving it to an enum in the service.
public record PlotRequest(
    @NotBlank String plotNo,
    @NotBlank @Pattern(regexp = "NORMAL|CORNER") String plotType,
    @NotNull @DecimalMin("0.01") BigDecimal areaSqft,
    @NotNull @DecimalMin("0.01") BigDecimal rate,
    @NotNull @DecimalMin("0.01") BigDecimal price,
    @Pattern(regexp = "AVAILABLE|BOOKED|SOLD") String status
) {}
