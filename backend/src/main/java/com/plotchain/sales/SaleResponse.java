package com.plotchain.sales;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record SaleResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    String buyerName,
    String buyerPhone,
    String buyerEmail,
    BigDecimal amount,
    UUID cycleId,
    String legCredited,
    String status,
    String voidReason,
    Instant recordedAt,
    String plotNo,
    String projectName,
    String associateUserId,
    String associateName,
    String note,
    String plotType,
    BigDecimal areaSqft,
    BigDecimal rate,
    BigDecimal listPrice,
    BigDecimal extraPrice
) {
    public SaleResponse(UUID id, UUID plotId, UUID associateId, String buyerName, String buyerPhone,
                        String buyerEmail, BigDecimal amount, UUID cycleId, String legCredited, String status,
                        String voidReason, Instant recordedAt, String plotNo, String projectName,
                        String associateUserId, String associateName, String note) {
        this(id, plotId, associateId, buyerName, buyerPhone, buyerEmail, amount, cycleId, legCredited, status,
            voidReason, recordedAt, plotNo, projectName, associateUserId, associateName, note,
            null, null, null, null, null);
    }
}
