package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);

    // Lifetime Total Left/Right Business (docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md):
    // each row's leftLegVolume/rightLegVolume already has the PRIOR cycle's carriedForward baked
    // in (CycleService#rollUpSubtree), so DashboardService must walk every row for this associate
    // in the order its cycle actually closed and subtract each row's incoming carry before
    // summing -- a naive SUM(leftLegVolume) double-counts a long-lived unmatched carry once per
    // cycle it survives. LegVolume has no @ManyToOne to Cycle (only a bare cycleId column), so
    // this joins the two entities ad-hoc on that id -- the same pattern SaleRepository already
    // uses to join Plot on plotId.
    @Query("SELECT l FROM LegVolume l JOIN Cycle c ON c.id = l.cycleId " +
        "WHERE l.associateId = :associateId ORDER BY c.periodStart ASC")
    List<LegVolume> findByAssociateIdOrderByCyclePeriodStartAsc(@Param("associateId") UUID associateId);
}
