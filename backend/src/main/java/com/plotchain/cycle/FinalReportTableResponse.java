package com.plotchain.cycle;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record FinalReportTableResponse(
    List<String> expenseTypes,
    List<String> refundTypes,
    List<CycleFinalReportResponse> rows,
    CycleFinalReportResponse total,
    List<CycleOption> allCycles) {

    public record CycleOption(UUID cycleId, LocalDate periodStart, LocalDate periodEnd, CycleStatus status) {}
}
