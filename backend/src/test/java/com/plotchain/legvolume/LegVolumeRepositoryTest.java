package com.plotchain.legvolume;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Dashboard unit 5 (docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md §3.1,
// "Total Left/Right Business"): proves the lifetime SUM aggregate genuinely spans multiple
// leg_volume rows (one per cycle close, per CycleService.rollUpSubtree) rather than reading a
// single cycle's row -- a property a mocked repository can't exercise.
@DataJpaTest
@ActiveProfiles("test")
class LegVolumeRepositoryTest {

    @Autowired
    LegVolumeRepository legVolumeRepository;

    @Autowired
    TestEntityManager entityManager;

    private int rankOrderCounter = 1;

    private Associate seedAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", rankOrderCounter++, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate associate = new Associate();
        UUID id = UUID.randomUUID();
        associate.setId(id);
        associate.setName("Test Associate");
        associate.setRankId(rank.getId());
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        entityManager.persist(associate);
        return associate;
    }

    private Cycle seedCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        entityManager.persist(cycle);
        return cycle;
    }

    @Test
    void sumsLeftAndRightLegVolumeAcrossEveryCycleForThatAssociate() {
        Associate associate = seedAssociate();
        Cycle cycleOne = seedCycle();
        Cycle cycleTwo = seedCycle();
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), cycleOne.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), cycleTwo.getId(),
            new BigDecimal("200000"), new BigDecimal("150000"), BigDecimal.ZERO, BigDecimal.ZERO));

        assertThat(legVolumeRepository.sumLeftLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("300000");
        assertThat(legVolumeRepository.sumRightLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("200000");
    }

    @Test
    void excludesLegVolumeRowsForADifferentAssociate() {
        Associate target = seedAssociate();
        Associate other = seedAssociate();
        Cycle cycle = seedCycle();
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), target.getId(), cycle.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), other.getId(), cycle.getId(),
            new BigDecimal("999999"), new BigDecimal("999999"), BigDecimal.ZERO, BigDecimal.ZERO));

        assertThat(legVolumeRepository.sumLeftLegVolumeByAssociateId(target.getId())).isEqualByComparingTo("100000");
        assertThat(legVolumeRepository.sumRightLegVolumeByAssociateId(target.getId())).isEqualByComparingTo("50000");
    }

    @Test
    void returnsZeroNotNullWhenTheAssociateHasNoLegVolumeRowsYet() {
        Associate associate = seedAssociate();

        assertThat(legVolumeRepository.sumLeftLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("0");
        assertThat(legVolumeRepository.sumRightLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("0");
    }
}
