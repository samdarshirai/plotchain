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
    String projectName
) {}
