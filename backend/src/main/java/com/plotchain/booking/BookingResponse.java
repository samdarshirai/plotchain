package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BookingResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    BookingStatus status,
    String buyerName,
    BigDecimal totalAmount,
    int installmentCount,
    Instant bookedAt,
    BigDecimal paidAmount,
    BigDecimal dueAmount,
    List<EmiInstallmentResponse> installments
) {}
