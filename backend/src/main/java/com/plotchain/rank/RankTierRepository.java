package com.plotchain.rank;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RankTierRepository extends JpaRepository<RankTier, UUID> {
    List<RankTier> findAllByOrderByRankOrder();
}
