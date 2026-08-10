package com.plotchain.sales;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {

    // Cycle-management unit 4 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #4 / Data model section): owned by the Sales package but added here since Sales'
    // own units never needed it -- the settlement batch's one query to load this cycle's
    // RECORDED sale volume for the in-memory leg-volume rollup. VOIDED sales are excluded by
    // the status filter; the batch never sees them.
    List<Sale> findByCycleIdAndStatus(UUID cycleId, SaleStatus status);
}
