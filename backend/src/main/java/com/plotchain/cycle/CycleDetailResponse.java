package com.plotchain.cycle;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// GET /api/admin/cycles/{id} response (cycle-management unit 2, spec lines 95-97):
// CycleSummaryResponse's four fields (id, periodStart, periodEnd, status) plus the
// per-income-type breakdown and the cycle's overall totalNet ("Same fields plus a
// per-income-type breakdown"). Deliberately its own flat record rather than wrapping/nesting
// CycleSummaryResponse -- records can't extend one another, and duplicating four fields here
// keeps the JSON flat instead of nested under a "summary" key nothing in the spec asks for.
public record CycleDetailResponse(
    UUID id,
    LocalDate periodStart,
    LocalDate periodEnd,
    CycleStatus status,
    List<CycleIncomeTypeTotal> incomeTypeTotals,
    BigDecimal totalNet) {}
