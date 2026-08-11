package com.plotchain.income;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByAssociateCycleAndType(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId")
    BigDecimal sumNetAmountByAssociateAndCycle(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId);

    // Company-wide siblings of the per-associate sums above, for AdminStatsService: same JPQL
    // shape minus the associateId filter.
    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByCycleAndType(@Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.cycleId = :cycleId")
    BigDecimal sumNetAmountByCycle(@Param("cycleId") UUID cycleId);

    // Decision #12's idempotency check: called before every write the settlement batch makes.
    // A plain Spring Data derived query -- the unique constraint added by V17 is the DB-level
    // backstop this check is meant to make redundant, never the other way around.
    boolean existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
        UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef);

    // Cycle-management unit 7 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #9): locates a sponsee's Matching LedgerEntry for this cycle, so Sponsor Matching
    // can base its own grossAmount on it. A fresh query, not a carry-over from creditMatchingIncome's
    // in-memory work -- see this unit's plan for why that's the deliberate choice, and Task 4's
    // integration test for the proof it's safe within the single settlement-batch transaction.
    // Unqualified by associateId+cycleId+incomeType alone being enough to disambiguate: an
    // associate has at most one MATCHING entry per cycle (unit 5 writes exactly one per associate
    // per cycle, guarded by its own idempotency check), so Optional<LedgerEntry> is correct, not
    // a lossy simplification of a potential multi-row result.
    Optional<LedgerEntry> findByAssociateIdAndCycleIdAndIncomeType(UUID associateId, UUID cycleId, IncomeType incomeType);

    // Sales unit 5 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", step 5): looks up the DIRECT LedgerEntry a RECORDED sale created at
    // record time (sourceRef = sale.id, set by SaleService.recordSale), so SaleService.voidSale
    // can flip its status to REVERSED. Only DIRECT entries set sourceRef today (V16__sale.sql),
    // and recordSale creates exactly one LedgerEntry per Sale in the same transaction as the
    // Sale row, so a plain single-result derived query is safe. If a future income type
    // (matching, sponsor, reward -- all still unbuilt) ever also sets sourceRef to a sale id for
    // a *different* associate/cycle, this query would need revisiting to disambiguate by
    // incomeType too, but that's out of scope for this unit.
    Optional<LedgerEntry> findBySourceRef(UUID sourceRef);
}
