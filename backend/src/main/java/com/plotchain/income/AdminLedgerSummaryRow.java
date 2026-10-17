package com.plotchain.income;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record AdminLedgerSummaryRow(
    UUID associateId,
    String associateUserId,
    String associateName,
    UUID cycleId,
    LocalDate cyclePeriodStart,
    LocalDate cyclePeriodEnd,
    Map<IncomeType, BigDecimal> gross,
    BigDecimal totalGross,
    BigDecimal tds,
    BigDecimal adminCharges,
    BigDecimal totalNet,
    long entryCount,
    long paidCount) {}
