package com.plotchain.masterproject;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record MasterProjectRequest(
    @NotBlank @Size(max = 120) String name,
    @NotNull MasterProject.Type type,
    @NotBlank @Size(max = 100) String city,
    @NotBlank @Size(max = 100) String state,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal businessPercentage,
    @NotNull @DecimalMin("0") BigDecimal ratePerSqft,
    MasterProject.Status status
) {}
