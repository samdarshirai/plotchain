package com.plotchain.associate;

import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class AssociateRepositoryTest {

    @Autowired
    AssociateRepository associateRepository;

    @Autowired
    org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void countDownlineCountsAllDescendantsRegardlessOfDepth() {
        UUID tenantId = UUID.randomUUID();
        RankTier rank = new RankTier(UUID.randomUUID(), tenantId, "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(tenantId, null, null, rank.getId());
        Associate child = newAssociate(tenantId, root.getId(), "L", rank.getId());
        Associate grandchild = newAssociate(tenantId, child.getId(), "L", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, child, grandchild));
        entityManager.flush();

        long count = associateRepository.countDownline(root.getId());

        assertThat(count).isEqualTo(2);
    }

    private Associate newAssociate(UUID tenantId, UUID parentId, String position, UUID rankId) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setTenantId(tenantId);
        a.setParentId(parentId);
        a.setPosition(position);
        a.setName("Test Associate");
        a.setRankId(rankId);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        return a;
    }
}
