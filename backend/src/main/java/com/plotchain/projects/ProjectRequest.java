package com.plotchain.projects;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

// cornerExtraPercent: default Extra Price % for CORNER plots; null = keep current (10 on create).
public record ProjectRequest(
    @NotBlank String name,
    @NotBlank String location,
    @DecimalMin("0") @DecimalMax("100") BigDecimal cornerExtraPercent
) {
    public ProjectRequest(String name, String location) {
        this(name, location, null);
    }
}
