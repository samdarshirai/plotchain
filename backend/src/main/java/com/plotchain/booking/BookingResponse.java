package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BookingResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    BigDecimal totalAmount,
    int installmentCount,
    Instant bookedAt,
    List<EmiInstallmentResponse> installments
) {}
