package com.plotchain.rank;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class RankTierRepositoryTest {

    @Autowired
    RankTierRepository rankTierRepository;

    @Test
    void productionMigrationSeedsTheFourDefaultRanksInAscendingOrder() {
        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();

        assertThat(ranks).extracting(RankTier::getName).containsExactly("Silver", "Gold", "Diamond", "Crown");
        assertThat(ranks.get(0).getRankOrder()).isLessThan(ranks.get(1).getRankOrder());
    }
}
