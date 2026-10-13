package com.plotchain.epin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record BulkTransferEPinRequest(
    @Min(1) @Max(500) int count,
    @NotBlank String toUserId,
    EPinType pinType,
    String transactionPassword
) {}
