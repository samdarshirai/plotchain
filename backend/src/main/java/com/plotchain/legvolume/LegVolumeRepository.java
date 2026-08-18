package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);

    // Lifetime totals (dashboard's "Total Left/Right Business"): every cycle close writes a NEW
    // LegVolume row per associate (CycleService#rollUpSubtree), so this genuinely aggregates
    // across all of them -- not a single-cycle read. COALESCE avoids returning null for an
    // associate with no leg_volume rows yet.
    @Query("SELECT COALESCE(SUM(l.leftLegVolume), 0) FROM LegVolume l WHERE l.associateId = :associateId")
    BigDecimal sumLeftLegVolumeByAssociateId(@Param("associateId") UUID associateId);

    @Query("SELECT COALESCE(SUM(l.rightLegVolume), 0) FROM LegVolume l WHERE l.associateId = :associateId")
    BigDecimal sumRightLegVolumeByAssociateId(@Param("associateId") UUID associateId);
}
