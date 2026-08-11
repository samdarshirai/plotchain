package com.plotchain.cycle;

import com.plotchain.income.IncomeType;

import java.math.BigDecimal;

// GET /api/admin/cycles/{id}'s per-income-type breakdown line item (cycle-management unit 2,
// docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md, lines
// 95-97): one row per IncomeType in CycleService.BREAKDOWN_INCOME_TYPES, sourced from the
// existing LedgerEntryRepository.sumNetAmountByCycleAndType -- no new query needed.
public record CycleIncomeTypeTotal(IncomeType incomeType, BigDecimal totalNet) {}
