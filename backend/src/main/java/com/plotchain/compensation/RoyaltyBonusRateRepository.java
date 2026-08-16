package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoyaltyBonusRateRepository extends JpaRepository<RoyaltyBonusRate, UUID> {
    List<RoyaltyBonusRate> findAllByPlanVersionId(UUID planVersionId);

    // Volume-slab lookup: "highest threshold not exceeded" against the associate's own matched
    // volume this cycle -- compensation-plan-reference.md §3 ("Royalty Bonus will Calculate on
    // the Bonus of New Matching Business in a Single Closing"), not rank-keyed. Empty Optional
    // means "no slab configured at or below this matched volume" -- a legitimate no-op, not a
    // failure condition.
    Optional<RoyaltyBonusRate> findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
        UUID planVersionId, BigDecimal matchedVolume);
}
