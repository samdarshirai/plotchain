package com.plotchain.epin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AllocateEPinRequest(
    @NotNull UUID associateId,
    @Min(1) @Max(2000) int count,
    UUID batchId
) {}
