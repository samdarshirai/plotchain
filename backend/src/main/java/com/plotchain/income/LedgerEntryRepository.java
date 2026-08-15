package com.plotchain.income;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
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

    // Cycle-management unit 9 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #8): Reward's own idempotency check. Deliberately narrower than
    // existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef above -- omits cycleId on purpose,
    // because a RewardTier is awarded once EVER, not once per cycle. Same plain Spring Data
    // derived query shape as the cycle-scoped version; the DB-level uq_ledger_entry_idempotency
    // constraint (V17) is still cycle-scoped, so this application-level check is what actually
    // does the cross-cycle work -- see this unit's plan, Global Constraints.
    boolean existsByAssociateIdAndIncomeTypeAndSourceRef(
        UUID associateId, IncomeType incomeType, UUID sourceRef);

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

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // New repository methods section): the crediting step's one read query -- every PENDING entry
    // for a closed cycle, the exact set WalletCreditingService.creditWallets(...) processes.
    // Entries in other cycles or with CARRIED_FORWARD/PAID/REVERSED status are excluded by the
    // query itself.
    List<LedgerEntry> findByCycleIdAndStatus(UUID cycleId, LedgerEntryStatus status);

    // Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decision 4, Flow "Admin ledger register"): shared by both the admin register endpoint and
    // (a follow-up unit's) associate-self endpoint -- the associate endpoint always passes its
    // own caller id as associateId (never null), while the admin endpoint passes through
    // whatever the caller supplied (possibly null). Same null-safe "(:param IS NULL OR ...)"
    // JPQL pattern AssociateRepository#searchDirectory already uses. UUID- and enum-typed params
    // (associateId, incomeType, cycleId, status) don't need the explicit CAST that
    // searchDirectory's :search string param needs -- Hibernate resolves UUID/enum parameter
    // types from the Java method signature alone, independent of the surrounding SQL, per that
    // method's own comment.
    @Query("""
        SELECT l FROM LedgerEntry l
        WHERE (:associateId IS NULL OR l.associateId = :associateId)
        AND (:incomeType IS NULL OR l.incomeType = :incomeType)
        AND (:cycleId IS NULL OR l.cycleId = :cycleId)
        AND (:status IS NULL OR l.status = :status)
        ORDER BY l.createdAt DESC
        """)
    Page<LedgerEntry> search(
        @Param("associateId") UUID associateId,
        @Param("incomeType") IncomeType incomeType,
        @Param("cycleId") UUID cycleId,
        @Param("status") LedgerEntryStatus status,
        Pageable pageable);
}
