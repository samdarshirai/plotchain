package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decisions 11-13): associateUserId/associateName and cyclePeriodStart/cyclePeriodEnd are
// batch-resolved by LedgerService, not raw UUIDs alone -- a bare associateId/cycleId would force
// a second round trip per row for any real UI. sourceRef is nullable: only DIRECT entries
// populate it today (Decision 13). A separate record from a future
// AssociateLedgerEntryResponse (unit 2), not one type with associate fields nulled out --
// matches the existing AdminAssociateSummaryResponse/DashboardResponse pattern of purpose-built
// response types per consumer.
public record AdminLedgerEntryResponse(
    UUID id,
    UUID associateId,
    String associateUserId,
    String associateName,
    IncomeType incomeType,
    UUID cycleId,
    LocalDate cyclePeriodStart,
    LocalDate cyclePeriodEnd,
    BigDecimal grossAmount,
    BigDecimal tdsDeduction,
    BigDecimal adminDeduction,
    BigDecimal netAmount,
    LedgerEntryStatus status,
    UUID sourceRef,
    Instant createdAt) {}
