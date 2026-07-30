package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoyaltyBonusRateRepository extends JpaRepository<RoyaltyBonusRate, UUID> {
    List<RoyaltyBonusRate> findAllByPlanVersionId(UUID planVersionId);
}
