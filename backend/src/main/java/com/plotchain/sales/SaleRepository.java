package com.plotchain.sales;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
