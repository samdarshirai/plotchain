package com.plotchain.sales;

import com.plotchain.projects.Plot;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {

    // Cycle-management unit 4 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #4 / Data model section): owned by the Sales package but added here since Sales'
    // own units never needed it -- the settlement batch's one query to load this cycle's
    // RECORDED sale volume for the in-memory leg-volume rollup. VOIDED sales are excluded by
    // the status filter; the batch never sees them.
    List<Sale> findByCycleIdAndStatus(UUID cycleId, SaleStatus status);

    long countByCycleIdAndStatus(UUID cycleId, SaleStatus status);

    // Admin Stats "Sales Recorded" tile: all-time count, unscoped by cycle.
    long countByStatus(SaleStatus status);

    @Query("SELECT COALESCE(SUM(s.amount), 0) FROM Sale s WHERE s.cycleId = :cycleId AND s.status = :status")
    BigDecimal sumAmountByCycleIdAndStatus(@Param("cycleId") UUID cycleId, @Param("status") SaleStatus status);

    // Dashboard mockup's Sales This Cycle KPI tile (dashboard-mockup spec §3.1): a plain derived
    // query, same shape as the existing countByCycleIdAndStatus but scoped to one associate too.
    long countByAssociateIdAndCycleIdAndStatus(UUID associateId, UUID cycleId, SaleStatus status);

    // Dashboard mockup's Revenue Booked KPI tile (dashboard-mockup spec §3.1): COALESCE mirrors
    // sumAmountByCycleIdAndStatus above -- an associate/cycle with no matching sales must sum to
    // 0, not null.
    @Query("SELECT COALESCE(SUM(s.amount), 0) FROM Sale s WHERE s.associateId = :associateId AND s.cycleId = :cycleId AND s.status = :status")
    BigDecimal sumAmountByAssociateIdAndCycleIdAndStatus(
        @Param("associateId") UUID associateId,
        @Param("cycleId") UUID cycleId,
        @Param("status") SaleStatus status);

    // Dashboard's "New Booked Area" (docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md
    // §3.1): SUM of plot.area_sqft for the associate's RECORDED sales in one cycle. Sale has no
    // JPA relationship to Plot (plot_id is a bare UUID column), so this is an ad-hoc JPQL join on
    // the FK equality -- Hibernate 6 supports "JOIN Plot p ON p.id = s.plotId" between unrelated
    // entities. COALESCE avoids returning null for an associate/cycle with no matching sales.
    @Query("SELECT COALESCE(SUM(p.areaSqft), 0) FROM Sale s JOIN Plot p ON p.id = s.plotId " +
        "WHERE s.associateId = :associateId AND s.cycleId = :cycleId AND s.status = :status")
    BigDecimal sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
        @Param("associateId") UUID associateId,
        @Param("cycleId") UUID cycleId,
        @Param("status") SaleStatus status);

    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): filters Sale rows down to the
    // caller's self-plus-downline ID set (AssociateRepository.findSelfAndDownline). A plain
    // Spring Data derived query -- no @Query needed, unlike searchRegister's optional-filter
    // shape, since this always has exactly one non-optional filter (the ID set) and a fixed
    // sort order. ORDER BY recordedAt DESC: same newest-first convention as searchRegister.
    Page<Sale> findByAssociateIdInOrderByRecordedAtDesc(List<UUID> associateIds, Pageable pageable);

    // Sales unit 6 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Admin register -- GET /api/admin/sales"): all four filters are optional (null = "don't
    // filter on this"), same IS NULL OR pattern as AssociateRepository.searchDirectory.
    // recordedToExclusive is an EXCLUSIVE upper bound, same convention as searchDirectory's
    // joinedToExclusive: callers pass the day AFTER the last day to include.
    // recordedFrom/recordedToExclusive get the explicit CAST(... AS timestamp) treatment
    // searchDirectory's joinedFrom/joinedToExclusive use, for the same reason documented there:
    // Postgres must assign every bind parameter a static type up front, and a bare Instant used
    // only in an "? IS NULL" check with no adjoining comparison at that position can't be
    // inferred otherwise. associateId/status don't need it -- Hibernate resolves UUID- and
    // enum-typed parameters from their Java type alone.
    // ORDER BY recordedAt DESC: newest-first, the natural read order for a running sales log.
    @Query("""
        SELECT s FROM Sale s
        WHERE (:associateId IS NULL OR s.associateId = :associateId)
        AND (:status IS NULL OR s.status = :status)
        AND (CAST(:recordedFrom AS timestamp) IS NULL OR s.recordedAt >= :recordedFrom)
        AND (CAST(:recordedToExclusive AS timestamp) IS NULL OR s.recordedAt < :recordedToExclusive)
        ORDER BY s.recordedAt DESC
        """)
    Page<Sale> searchRegister(
        @Param("associateId") UUID associateId,
        @Param("status") SaleStatus status,
        @Param("recordedFrom") Instant recordedFrom,
        @Param("recordedToExclusive") Instant recordedToExclusive,
        Pageable pageable);
}
