package com.plotchain.compensation;

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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class CompensationPlanVersionRepositoryTest {

    private static final UUID SEED_VERSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    CompensationPlanVersionRepository compensationPlanVersionRepository;

    @Autowired
    RoyaltyBonusRateRepository royaltyBonusRateRepository;

    @Autowired
    RewardTierRepository rewardTierRepository;

    @Autowired
    TestEntityManager entityManager;

    @Test
    void findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDescReturnsTheV8SeedRow() {
        Optional<CompensationPlanVersion> found = compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now());

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(SEED_VERSION_ID);
        assertThat(found.get().getVersionLabel()).isEqualTo("v1");
        assertThat(found.get().getMatchingIncomePct()).isEqualByComparingTo("7.00");
    }

    @Test
    void findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDescPicksTheLatestEffectiveVersion() {
        CompensationPlanVersion futureVersion = newVersion("v2", LocalDate.now().plusDays(30));
        CompensationPlanVersion pastVersion = newVersion("v1.5", LocalDate.now().minusDays(1));
        entityManager.persist(futureVersion);
        entityManager.persist(pastVersion);
        entityManager.flush();

        // The genesis "v1" row is effective from 2000-01-01, so the most recent version whose
        // effective_from is still <= today is "v1.5", not the seed and not the future-dated "v2".
        Optional<CompensationPlanVersion> found = compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now());

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(pastVersion.getId());
    }

    @Test
    void findFirstByOrderByCreatedAtDescReturnsTheMostRecentlyCreatedVersionEvenIfFutureDated() {
        // A version created just now but effective far in the future should still win this
        // query -- it tracks creation recency, not effective-date recency.
        CompensationPlanVersion scheduledVersion = newVersion("v2", LocalDate.now().plusYears(1));
        entityManager.persist(scheduledVersion);
        entityManager.flush();

        Optional<CompensationPlanVersion> found = compensationPlanVersionRepository.findFirstByOrderByCreatedAtDesc();

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(scheduledVersion.getId());
    }

    @Test
    void findAllByOrderByEffectiveFromDescReturnsAllVersionsNewestFirst() {
        CompensationPlanVersion futureVersion = newVersion("v2", LocalDate.now().plusDays(30));
        entityManager.persist(futureVersion);
        entityManager.flush();

        List<CompensationPlanVersion> versions = compensationPlanVersionRepository.findAllByOrderByEffectiveFromDesc();

        assertThat(versions).hasSize(2);
        assertThat(versions.get(0).getId()).isEqualTo(futureVersion.getId());
        assertThat(versions.get(1).getId()).isEqualTo(SEED_VERSION_ID);
    }

    // The genesis plan version (SEED_VERSION_ID) is pre-seeded with 5 real royalty slabs by
    // V23__royalty_bonus_rate_volume_slab.sql, so Royalty-specific tests below persist their own
    // isolated plan version instead -- reusing SEED_VERSION_ID would collide with (or be
    // ambiguously mixed in with) that seed data.
    private CompensationPlanVersion persistPlanVersion(LocalDate effectiveFrom) {
        CompensationPlanVersion version = new CompensationPlanVersion(
            UUID.randomUUID(), "royalty-test", effectiveFrom,
            BigDecimal.ZERO, new BigDecimal("7.00"), BigDecimal.ZERO,
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
        entityManager.persist(version);
        return version;
    }

    @Test
    void findAllByPlanVersionIdReturnsOnlyRatesForThatVersion() {
        CompensationPlanVersion version = persistPlanVersion(LocalDate.of(2027, 1, 1));
        RoyaltyBonusRate rate = new RoyaltyBonusRate(UUID.randomUUID(), version.getId(), new BigDecimal("2000000.00"), new BigDecimal("3.00"));
        royaltyBonusRateRepository.save(rate);
        entityManager.flush();

        List<RoyaltyBonusRate> rates = royaltyBonusRateRepository.findAllByPlanVersionId(version.getId());

        assertThat(rates).extracting(RoyaltyBonusRate::getId).containsExactly(rate.getId());
    }

    @Test
    void findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDescReturnsTheHighestQualifyingSlab() {
        CompensationPlanVersion version = persistPlanVersion(LocalDate.of(2027, 2, 1));
        RoyaltyBonusRate twentyLakh = new RoyaltyBonusRate(UUID.randomUUID(), version.getId(), new BigDecimal("2000000.00"), new BigDecimal("1.00"));
        RoyaltyBonusRate fortyLakh = new RoyaltyBonusRate(UUID.randomUUID(), version.getId(), new BigDecimal("4000000.00"), new BigDecimal("1.50"));
        RoyaltyBonusRate eightyLakh = new RoyaltyBonusRate(UUID.randomUUID(), version.getId(), new BigDecimal("8000000.00"), new BigDecimal("2.00"));
        royaltyBonusRateRepository.save(twentyLakh);
        royaltyBonusRateRepository.save(fortyLakh);
        royaltyBonusRateRepository.save(eightyLakh);
        entityManager.flush();

        // Matched volume ₹40,00,000 lands exactly on the ₹40L slab, one below the ₹80L slab --
        // "highest threshold not exceeded" must pick ₹40L, not ₹20L or ₹80L.
        Optional<RoyaltyBonusRate> found = royaltyBonusRateRepository
            .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
                version.getId(), new BigDecimal("4000000.00"));

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(fortyLakh.getId());
        assertThat(found.get().getRoyaltyPct()).isEqualByComparingTo("1.50");
    }

    @Test
    void findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDescReturnsEmptyWhenMatchedVolumeIsBelowEveryConfiguredSlab() {
        CompensationPlanVersion version = persistPlanVersion(LocalDate.of(2027, 3, 1));
        RoyaltyBonusRate twentyLakh = new RoyaltyBonusRate(UUID.randomUUID(), version.getId(), new BigDecimal("2000000.00"), new BigDecimal("1.00"));
        royaltyBonusRateRepository.save(twentyLakh);
        entityManager.flush();
        // Matched volume ₹10,00,000 is below the lowest configured slab -- the "no-op if no
        // rate configured" case CycleService's Royalty step needs to distinguish from an error.

        Optional<RoyaltyBonusRate> found = royaltyBonusRateRepository
            .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
                version.getId(), new BigDecimal("1000000.00"));

        assertThat(found).isEmpty();
    }

    @Test
    void findAllByPlanVersionIdOrderByTierLevelReturnsTiersInAscendingOrder() {
        RewardTier tierTwo = new RewardTier(UUID.randomUUID(), SEED_VERSION_ID, 2, new BigDecimal("50000.00"), new BigDecimal("5000.00"), "Trip");
        RewardTier tierOne = new RewardTier(UUID.randomUUID(), SEED_VERSION_ID, 1, new BigDecimal("10000.00"), new BigDecimal("1000.00"), null);
        rewardTierRepository.save(tierTwo);
        rewardTierRepository.save(tierOne);
        entityManager.flush();

        List<RewardTier> tiers = rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(SEED_VERSION_ID);

        assertThat(tiers).extracting(RewardTier::getTierLevel).containsExactly(1, 2);
    }

    private CompensationPlanVersion newVersion(String label, LocalDate effectiveFrom) {
        return new CompensationPlanVersion(
                UUID.randomUUID(),
                label,
                effectiveFrom,
                new BigDecimal("10.00"),
                new BigDecimal("7.00"),
                new BigDecimal("5.00"),
                new BigDecimal("2.00"),
                new BigDecimal("5.00"),
                new BigDecimal("15.00"),
                new BigDecimal("1100.00"),
                new BigDecimal("500.00"),
                SettlementCycle.SEMI_MONTHLY,
                Instant.now(),
                null,
                BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }
}
