package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
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
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate child = newAssociate(root.getId(), "L", rank.getId());
        Associate grandchild = newAssociate(child.getId(), "L", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, child, grandchild));
        entityManager.flush();

        long count = associateRepository.countDownline(root.getId());

        assertThat(count).isEqualTo(2);
    }

    @Test
    void countJoinedBetweenIncludesAssociatesWhoJoinOnTheEndDate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        LocalDate start = LocalDate.now().minusDays(5);
        LocalDate end = LocalDate.now();

        Associate root = newAssociate(null, null, rank.getId());
        Associate lastDayJoiner = newAssociate(root.getId(), "L", rank.getId());
        lastDayJoiner.setJoinedAt(instantAt(end, LocalTime.of(23, 59, 59)));
        associateRepository.saveAll(java.util.List.of(root, lastDayJoiner));
        entityManager.flush();

        // Upper bound is exclusive by contract: callers pass the day AFTER the last day to
        // include (mirrors what DashboardService does with cycle.getPeriodEnd().plusDays(1)).
        long count = associateRepository.countJoinedBetween(root.getId(), start, end.plusDays(1));

        assertThat(count).isEqualTo(1);
    }

    // Uses the JVM default zone (matching how the DATE query params below are interpreted
    // against the TIMESTAMP-without-timezone joined_at column) so the boundary lines up.
    private static Instant instantAt(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(ZoneId.systemDefault()).toInstant();
    }

    private Associate newAssociate(UUID parentId, String position, UUID rankId) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
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
