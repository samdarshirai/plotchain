package com.plotchain.epin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// pinType optional: null = allocate the oldest live pins of any type.
public record AllocateEPinRequest(
    @NotNull UUID associateId,
    @Min(1) @Max(2000) int count,
    UUID batchId,
    EPinType pinType
) {
    public AllocateEPinRequest(UUID associateId, int count, UUID batchId) {
        this(associateId, count, batchId, null);
    }
}
