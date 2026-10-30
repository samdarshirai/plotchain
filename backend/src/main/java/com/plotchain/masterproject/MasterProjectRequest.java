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
    MasterProject.Status status,
    @DecimalMin("0") @DecimalMax("100") BigDecimal cornerExtraPercent,
    @DecimalMin("0") @DecimalMax("100") BigDecimal parkFacingExtraPercent,
    @DecimalMin("0") @DecimalMax("100") BigDecimal roadSideExtraPercent
) {
    public MasterProjectRequest(String name, MasterProject.Type type, String city, String state,
                                BigDecimal businessPercentage, BigDecimal ratePerSqft, MasterProject.Status status) {
        this(name, type, city, state, businessPercentage, ratePerSqft, status, null);
    }

    public MasterProjectRequest(String name, MasterProject.Type type, String city, String state,
                                BigDecimal businessPercentage, BigDecimal ratePerSqft, MasterProject.Status status,
                                BigDecimal cornerExtraPercent) {
        this(name, type, city, state, businessPercentage, ratePerSqft, status, cornerExtraPercent, null, null);
    }
}
