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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Dashboard leg-volume fix plan (docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md,
// Task 1): DashboardService walks this list in chronological order to subtract each row's
// incoming carry-forward before summing lifetime totals (Task 2) -- proving the ORDER BY actually
// orders by when each cycle closed, not row-insertion order or id, is the whole point of this
// test; a mocked repository can't exercise a real ORDER BY.
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

    private Cycle seedCycle(LocalDate periodStart) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(periodStart);
        cycle.setPeriodEnd(periodStart.plusDays(14));
        cycle.setStatus(CycleStatus.CLOSED);
        entityManager.persist(cycle);
        return cycle;
    }

    @Test
    void ordersRowsByWhenTheirCycleActuallyClosedNotByInsertionOrder() {
        Associate associate = seedAssociate();
        Cycle newer = seedCycle(LocalDate.of(2026, 8, 1));
        Cycle older = seedCycle(LocalDate.of(2026, 7, 1));
        // Insert the newer cycle's row FIRST -- if the query ordered by insertion/id instead of
        // c.periodStart, this row would come back first too, and the test would still pass by
        // accident. Inserting out of chronological order is what makes the ORDER BY load-bearing.
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), newer.getId(),
            new BigDecimal("300000"), new BigDecimal("200000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), older.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));

        List<LegVolume> rows = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associate.getId());

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getCycleId()).isEqualTo(older.getId());
        assertThat(rows.get(1).getCycleId()).isEqualTo(newer.getId());
    }

    @Test
    void excludesLegVolumeRowsForADifferentAssociate() {
        Associate target = seedAssociate();
        Associate other = seedAssociate();
        Cycle cycle = seedCycle(LocalDate.of(2026, 7, 1));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), target.getId(), cycle.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), other.getId(), cycle.getId(),
            new BigDecimal("999999"), new BigDecimal("999999"), BigDecimal.ZERO, BigDecimal.ZERO));

        List<LegVolume> rows = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(target.getId());

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getLeftLegVolume()).isEqualByComparingTo("100000");
    }

    @Test
    void returnsEmptyListNotNullWhenTheAssociateHasNoLegVolumeRowsYet() {
        Associate associate = seedAssociate();

        List<LegVolume> rows = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associate.getId());

        assertThat(rows).isEmpty();
    }
}
