package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
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

    @Query("SELECT l FROM LegVolume l JOIN Cycle c ON c.id = l.cycleId " +
        "WHERE l.associateId IN :associateIds ORDER BY c.periodStart ASC")
    List<LegVolume> findByAssociateIdInOrderByCyclePeriodStartAsc(@Param("associateIds") List<UUID> associateIds);

    record LegBusinessTotals(BigDecimal left, BigDecimal right) {
        public LegBusinessTotals plus(BigDecimal openLeft, BigDecimal openRight) {
            return new LegBusinessTotals(left.add(openLeft), right.add(openRight));
        }
    }

    // Single home for the carry-forward-adjusted summation above (see the comment on
    // findByAssociateIdOrderByCyclePeriodStartAsc) -- both DashboardService (self-scoped) and
    // the admin Tree Explorer's per-node hover details (arbitrary associate) need this exact
    // computation, and it's easy to get the carry-subtraction subtly wrong if reimplemented.
    default LegBusinessTotals totalBusiness(UUID associateId) {
        return totalBusinessFromHistory(findByAssociateIdOrderByCyclePeriodStartAsc(associateId));
    }

    static LegBusinessTotals totalBusinessFromHistory(List<LegVolume> history) {
        BigDecimal totalLeft = BigDecimal.ZERO;
        BigDecimal totalRight = BigDecimal.ZERO;
        BigDecimal incomingCarryLeft = BigDecimal.ZERO;
        BigDecimal incomingCarryRight = BigDecimal.ZERO;
        for (LegVolume row : history) {
            totalLeft = totalLeft.add(row.getLeftLegVolume().subtract(incomingCarryLeft));
            totalRight = totalRight.add(row.getRightLegVolume().subtract(incomingCarryRight));
            incomingCarryLeft = row.getCarriedForwardLeft();
            incomingCarryRight = row.getCarriedForwardRight();
        }
        return new LegBusinessTotals(totalLeft, totalRight);
    }
}
