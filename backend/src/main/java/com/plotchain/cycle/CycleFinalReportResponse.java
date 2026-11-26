package com.plotchain.cycle;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CycleFinalReportResponse(
    UUID cycleId,
    LocalDate periodStart,
    LocalDate periodEnd,
    CycleStatus status,
    BigDecimal totalBusiness,
    BigDecimal grossCommission,
    List<CycleIncomeTypeTotal> incomeTypeTotals,
    List<NamedAmount> expenses,
    BigDecimal totalExpenses,
    BigDecimal totalPayout,
    BigDecimal payoutPercent,
    List<NamedAmount> refunds,
    BigDecimal totalRefunds) {

    public record NamedAmount(String name, BigDecimal amount) {}
}
