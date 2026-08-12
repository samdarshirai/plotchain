package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoyaltyBonusRateRepository extends JpaRepository<RoyaltyBonusRate, UUID> {
    List<RoyaltyBonusRate> findAllByPlanVersionId(UUID planVersionId);

    // Cycle-management unit 8 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Flow step 6): Royalty's single-rank lookup per associate, narrower than
    // findAllByPlanVersionId above. Empty Optional means "no royalty rate configured for this
    // rank" -- a legitimate no-op per Flow step 6's own text ("not an error -- some low ranks may
    // have no royalty tier"), not a failure condition.
    Optional<RoyaltyBonusRate> findByPlanVersionIdAndRankId(UUID planVersionId, UUID rankId);
}
