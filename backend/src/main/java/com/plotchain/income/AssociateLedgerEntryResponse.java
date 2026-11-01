package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 12): a separate record from AdminLedgerEntryResponse, not one shared type with
// associate-identity fields nulled out -- matches the existing AdminAssociateSummaryResponse/
// DashboardResponse pattern of purpose-built response types per consumer. Deliberately carries
// NO associateId/associateUserId/associateName fields: every row returned by
// GET /api/associates/me/ledger is always the caller's own (Decisions 3, 4), so echoing an
// associate identity back would be redundant at best and misleading at worst. cyclePeriodStart/
// cyclePeriodEnd are batch-resolved the same way as the admin response (Decision 11); sourceRef
// is nullable, same as the admin response (Decision 13).
public record AssociateLedgerEntryResponse(
    UUID id,
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
    Instant createdAt,
    LegBreakdown legBreakdown,
    // SPONSOR_MATCHING rows: the sponsee whose MATCHING entry (= sourceRef) earned this credit.
    // DIRECT rows: the sponsee who made the sale (= sourceRef). Null otherwise, or on a lookup miss.
    String sponseeUserId,
    BigDecimal sponseeMatchingAmount,
    // DIRECT rows only: the seller's name and the sale amount the 6% was taken from.
    String sponseeName,
    BigDecimal saleAmount) {

    // MATCHING rows only (null otherwise). calc* == matchingBusiness == min(total left, total right).
    public record LegBreakdown(
        BigDecimal bfLeft,
        BigDecimal bfRight,
        BigDecimal newLeft,
        BigDecimal newRight,
        BigDecimal totalLeft,
        BigDecimal totalRight,
        BigDecimal calcLeft,
        BigDecimal calcRight,
        BigDecimal matchingBusiness) {}
}
