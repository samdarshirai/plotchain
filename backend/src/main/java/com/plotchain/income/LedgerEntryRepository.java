package com.plotchain.income;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByAssociateCycleAndType(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId")
    BigDecimal sumNetAmountByAssociateAndCycle(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId);

    // Dashboard's Network & Income lifetime tiles (Matching Income, Sponsor's Matching): same
    // shape as sumNetAmountByAssociateCycleAndType above, minus the cycle filter.
    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.incomeType = :type")
    BigDecimal sumNetAmountByAssociateAndType(@Param("associateId") UUID associateId, @Param("type") IncomeType type);

    // Company-wide siblings of the per-associate sums above, for AdminStatsService: same JPQL
    // shape minus the associateId filter.
    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByCycleAndType(@Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.cycleId = :cycleId")
    BigDecimal sumNetAmountByCycle(@Param("cycleId") UUID cycleId);

    // Admin Dashboard redesign 1a's Network Health "active this cycle" figure: how many distinct
    // associates earned anything in the given cycle.
    @Query("SELECT COUNT(DISTINCT l.associateId) FROM LedgerEntry l WHERE l.cycleId = :cycleId")
    long countDistinctAssociatesByCycle(@Param("cycleId") UUID cycleId);

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
    // flow "Void a sale", step 5): originally the single-result lookup SaleService.voidSale used
    // to find the DIRECT LedgerEntry a RECORDED sale created at record time (sourceRef = sale.id).
    // No longer safe for that purpose: since Self-Performance Bonus (Task 4/5 of the
    // 2026-08-16 self-performance-bonus plan), a sale can create a second LedgerEntry sharing the
    // same sourceRef, which throws IncorrectResultSizeDataAccessException here. SaleService.voidSale
    // now uses findAllBySourceRef below instead. Kept only for direct repository-level tests below;
    // do not reintroduce a single-result sourceRef lookup into SaleService.
    Optional<LedgerEntry> findBySourceRef(UUID sourceRef);

    // Same source data as findBySourceRef above, but plural -- once a sale can create more than
    // one LedgerEntry sharing sourceRef = sale.id (Direct Income + Self-Performance Bonus, both
    // set at sale time in SaleService.recordSale), the old single-result findBySourceRef throws
    // IncorrectResultSizeDataAccessException at void time whenever both were credited.
    // SaleService.voidSale uses this one instead, reversing every entry it finds.
    List<LedgerEntry> findAllBySourceRef(UUID sourceRef);

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // New repository methods section): the crediting step's one read query -- every PENDING entry
    // for a closed cycle, the exact set WalletCreditingService.creditWallets(...) processes.
    // Entries in other cycles or with CARRIED_FORWARD/PAID/REVERSED status are excluded by the
    // query itself.
    List<LedgerEntry> findByCycleIdAndStatus(UUID cycleId, LedgerEntryStatus status);

    // Wallet/withdrawal unit 4 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 16, New repository methods section): the KYC-triggered reconciliation sweep's one
    // read query -- every CARRIED_FORWARD entry for one associate, deliberately unscoped by
    // cycleId (unlike findByCycleIdAndStatus above), since a sweep must catch withheld income from
    // any past cycle, not just the associate's most recent one.
    List<LedgerEntry> findByAssociateIdAndStatus(UUID associateId, LedgerEntryStatus status);

    // Reward tier ladder on /income-statement/reward: every REWARD row the associate has earned.
    List<LedgerEntry> findByAssociateIdAndIncomeType(UUID associateId, IncomeType incomeType);

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

    // Same null-safe filter as search(), summed over the whole filtered set (not one page) -- feeds
    // the associate Income Statement's "Total income" card.
    @Query("""
        SELECT COALESCE(SUM(l.grossAmount), 0) FROM LedgerEntry l
        WHERE (:associateId IS NULL OR l.associateId = :associateId)
        AND (:incomeType IS NULL OR l.incomeType = :incomeType)
        AND (:cycleId IS NULL OR l.cycleId = :cycleId)
        AND (:status IS NULL OR l.status = :status)
        """)
    BigDecimal sumGrossAmount(
        @Param("associateId") UUID associateId,
        @Param("incomeType") IncomeType incomeType,
        @Param("cycleId") UUID cycleId,
        @Param("status") LedgerEntryStatus status);

    // Admin Summary tab: gross income per type, plus gross/TDS/admin/net totals, one row per associate x cycle. Unpaged on purpose
    // (ponytail: rows = associates x cycles; LedgerService pages in memory -- push paging into SQL
    // if that count ever gets large).
    @Query("""
        SELECT l.associateId AS associateId, l.cycleId AS cycleId,
          COALESCE(SUM(CASE WHEN l.incomeType = com.plotchain.income.IncomeType.DIRECT THEN l.grossAmount ELSE 0 END), 0) AS direct,
          COALESCE(SUM(CASE WHEN l.incomeType = com.plotchain.income.IncomeType.MATCHING THEN l.grossAmount ELSE 0 END), 0) AS matching,
          COALESCE(SUM(CASE WHEN l.incomeType = com.plotchain.income.IncomeType.SPONSOR_MATCHING THEN l.grossAmount ELSE 0 END), 0) AS sponsorMatching,
          COALESCE(SUM(CASE WHEN l.incomeType = com.plotchain.income.IncomeType.ROYALTY THEN l.grossAmount ELSE 0 END), 0) AS royalty,
          COALESCE(SUM(CASE WHEN l.incomeType = com.plotchain.income.IncomeType.REWARD THEN l.grossAmount ELSE 0 END), 0) AS reward,
          COALESCE(SUM(CASE WHEN l.incomeType = com.plotchain.income.IncomeType.SELF_PERFORMANCE THEN l.grossAmount ELSE 0 END), 0) AS selfPerformance,
          COALESCE(SUM(l.grossAmount), 0) AS totalGross, COALESCE(SUM(l.tdsDeduction), 0) AS tds,
          COALESCE(SUM(l.adminDeduction), 0) AS adminCharges, COALESCE(SUM(l.netAmount), 0) AS totalNet,
          COUNT(l) AS entryCount, COUNT(l.fulfilledAt) AS paidCount
        FROM LedgerEntry l
        WHERE (:associateId IS NULL OR l.associateId = :associateId)
        AND (:cycleId IS NULL OR l.cycleId = :cycleId)
        GROUP BY l.associateId, l.cycleId
        """)
    List<LedgerSummaryRow> summarise(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId);

    List<LedgerEntry> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);

    // CycleService live income: this cycle's recomputable (cycle-derived, not yet wallet-PAID) rows.
    // The delete is a bulk JPQL statement so it hits the DB before the recompute re-inserts rows
    // that share a unique key (REWARD's sourceRef = tier id).
    @Query("SELECT l FROM LedgerEntry l WHERE l.cycleId = :cycleId AND l.incomeType IN :types AND l.status <> com.plotchain.income.LedgerEntryStatus.PAID")
    List<LedgerEntry> findRecomputable(@Param("cycleId") UUID cycleId, @Param("types") List<IncomeType> types);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM LedgerEntry l WHERE l.cycleId = :cycleId AND l.incomeType IN :types AND l.status <> com.plotchain.income.LedgerEntryStatus.PAID")
    void deleteRecomputable(@Param("cycleId") UUID cycleId, @Param("types") List<IncomeType> types);

    // DesignationService: every achieved reward tier (REWARD row -> reward_tier via sourceRef) for
    // the given associates, so the caller can pick the highest tierLevel per associate.
    @Query("""
        SELECT l.associateId AS associateId, t.tierLevel AS tierLevel, t.designation AS designation
        FROM LedgerEntry l, com.plotchain.compensation.RewardTier t
        WHERE t.id = l.sourceRef AND l.incomeType = com.plotchain.income.IncomeType.REWARD
        AND l.associateId IN :associateIds
        """)
    List<AchievedRewardTierRow> findAchievedRewardTiers(@Param("associateIds") Collection<UUID> associateIds);

    interface AchievedRewardTierRow {
        UUID getAssociateId();
        int getTierLevel();
        String getDesignation();
    }
}
