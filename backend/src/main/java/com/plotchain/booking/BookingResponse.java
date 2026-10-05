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
    List<EmiInstallmentResponse> installments,
    String plotNo,
    String projectName,
    String associateName
) {
    // Labels are additive (unit 14b); null when the referent is gone or the caller has no lookup.
    public BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName,
                           BigDecimal totalAmount, int installmentCount, Instant bookedAt,
                           BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments) {
        this(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
            paidAmount, dueAmount, installments, null, null, null);
    }
}
