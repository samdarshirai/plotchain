package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RewardTierRepository extends JpaRepository<RewardTier, UUID> {
    List<RewardTier> findAllByPlanVersionIdOrderByTierLevel(UUID planVersionId);
}
