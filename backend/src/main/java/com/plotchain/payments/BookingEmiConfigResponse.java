package com.plotchain.payments;

import java.time.Instant;

public record BookingEmiConfigResponse(
    boolean emiEnabled,
    int defaultInstallmentCount,
    String confirmRule,
    Integer confirmThresholdPercent,
    Instant updatedAt
) {}
