package com.plotchain.payments;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record BookingEmiConfigRequest(
    boolean emiEnabled,
    @NotNull @Min(1) Integer defaultInstallmentCount
) {}
