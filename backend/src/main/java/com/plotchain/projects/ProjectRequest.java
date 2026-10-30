package com.plotchain.projects;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

// Default Extra Price % per plot-type part (corner / park facing / road side); null = keep current
// (10 / 5 / 5 on create).
public record ProjectRequest(
    @NotBlank String name,
    @NotBlank String location,
    @DecimalMin("0") @DecimalMax("100") BigDecimal cornerExtraPercent,
    @DecimalMin("0") @DecimalMax("100") BigDecimal parkFacingExtraPercent,
    @DecimalMin("0") @DecimalMax("100") BigDecimal roadSideExtraPercent
) {
    public ProjectRequest(String name, String location) {
        this(name, location, null);
    }

    public ProjectRequest(String name, String location, BigDecimal cornerExtraPercent) {
        this(name, location, cornerExtraPercent, null, null);
    }
}
