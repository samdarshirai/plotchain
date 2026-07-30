package com.plotchain.compensation;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompensationPlanServiceTest {

    @Mock CompensationPlanVersionRepository versionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock RewardTierRepository rewardTierRepository;
    @Mock RankTierRepository rankTierRepository;

    CompensationPlanService compensationPlanService;

    private static final UUID RANK_ID = UUID.randomUUID();
    private static final UUID ADMIN_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        compensationPlanService = new CompensationPlanService(
            versionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository);
    }

    // -- fixtures --------------------------------------------------------

    private CompensationPlanVersion seedVersion() {
        return new CompensationPlanVersion(
            UUID.fromString("00000000-0000-0000-0000-000000000001"),
            "v1",
            LocalDate.of(2000, 1, 1),
            new BigDecimal("10.00"),
            new BigDecimal("7.00"),
            new BigDecimal("5.00"),
            new BigDecimal("2.00"),
            new BigDecimal("5.00"),
            new BigDecimal("15.00"),
            new BigDecimal("1100.00"),
            new BigDecimal("500.00"),
            SettlementCycle.SEMI_MONTHLY,
            Instant.parse("2020-01-01T00:00:00Z"),
            null
        );
    }

    private CompensationPlanVersion savedVersion(UUID createdBy) {
        return new CompensationPlanVersion(
            UUID.randomUUID(),
            "v2",
            LocalDate.now(),
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
            createdBy
        );
    }

    private CompensationPlanRequest requestWithTiers(List<RewardTierInput> tiers) {
        return requestWithTiersAndEffectiveFrom(tiers, null);
    }

    private CompensationPlanRequest requestWithTiersAndEffectiveFrom(List<RewardTierInput> tiers, LocalDate effectiveFrom) {
        return new CompensationPlanRequest(
            new BigDecimal("10.00"),
            new BigDecimal("7.00"),
            new BigDecimal("5.00"),
            new BigDecimal("2.00"),
            new BigDecimal("5.00"),
            new BigDecimal("15.00"),
            new BigDecimal("1100.00"),
            new BigDecimal("500.00"),
            "SEMI_MONTHLY",
            List.of(new RoyaltyBonusRateInput(RANK_ID, new BigDecimal("3.00"))),
            tiers,
            effectiveFrom
        );
    }

    // -- contiguity validation --------------------------------------------

    @Test
    void updatePlanThrowsWhenTierLevelsHaveAGap() {
        List<RewardTierInput> tiersWithGap = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1"),
            new RewardTierInput(3, new BigDecimal("2000"), new BigDecimal("200"), "Tier 3")
        );

        assertThatThrownBy(() -> compensationPlanService.updatePlan(requestWithTiers(tiersWithGap), ADMIN_ID))
            .isInstanceOf(RewardTierGapException.class)
            .hasMessageContaining("level 2")
            .hasMessageContaining("level 3");

        verify(versionRepository, never()).save(any());
    }

    @Test
    void updatePlanThrowsWhenThresholdDoesNotStrictlyIncrease() {
        List<RewardTierInput> nonIncreasingTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1"),
            new RewardTierInput(2, new BigDecimal("1000"), new BigDecimal("200"), "Tier 2")
        );

        assertThatThrownBy(() -> compensationPlanService.updatePlan(requestWithTiers(nonIncreasingTiers), ADMIN_ID))
            .isInstanceOf(RewardTierGapException.class)
            .hasMessageContaining("2");

        verify(versionRepository, never()).save(any());
    }

    // -- valid save --------------------------------------------------------

    @Test
    void updatePlanSavesNewVersionWithIncrementedLabelAndAdminId() {
        when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1"),
            new RewardTierInput(2, new BigDecimal("2000"), new BigDecimal("200"), "Tier 2")
        );

        CompensationPlanResponse response = compensationPlanService.updatePlan(requestWithTiers(validTiers), ADMIN_ID);

        ArgumentCaptor<CompensationPlanVersion> captor = ArgumentCaptor.forClass(CompensationPlanVersion.class);
        verify(versionRepository).save(captor.capture());
        CompensationPlanVersion saved = captor.getValue();

        assertThat(saved.getVersionLabel()).isEqualTo("v2");
        assertThat(saved.getCreatedByAssociateId()).isEqualTo(ADMIN_ID);
        assertThat(response.versionLabel()).isEqualTo("v2");
    }

    @Test
    void updatePlanWithoutExplicitEffectiveFromDefaultsToToday() {
        when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1")
        );

        CompensationPlanResponse response = compensationPlanService.updatePlan(
            requestWithTiersAndEffectiveFrom(validTiers, null), ADMIN_ID);

        ArgumentCaptor<CompensationPlanVersion> captor = ArgumentCaptor.forClass(CompensationPlanVersion.class);
        verify(versionRepository).save(captor.capture());
        assertThat(captor.getValue().getEffectiveFrom()).isEqualTo(LocalDate.now());
        assertThat(response.effectiveFrom()).isEqualTo(LocalDate.now());
    }

    // -- isComplete ----------------------------------------------------------

    @Test
    void isCompleteIsFalseWhenCurrentVersionHasNoCreatedByAssociateId() {
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now()))
            .thenReturn(Optional.of(seedVersion()));

        assertThat(compensationPlanService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWhenCurrentVersionHasCreatedByAssociateId() {
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now()))
            .thenReturn(Optional.of(savedVersion(ADMIN_ID)));

        assertThat(compensationPlanService.isComplete()).isTrue();
    }

    // -- getCurrentPlan ----------------------------------------------------

    @Test
    void getCurrentPlanResolvesRankNamesViaRankTierRepository() {
        CompensationPlanVersion current = seedVersion();
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now()))
            .thenReturn(Optional.of(current));

        RoyaltyBonusRate rate = new RoyaltyBonusRate(UUID.randomUUID(), current.getId(), RANK_ID, new BigDecimal("3.00"));
        when(royaltyBonusRateRepository.findAllByPlanVersionId(current.getId())).thenReturn(List.of(rate));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(current.getId())).thenReturn(List.of());

        RankTier rankTier = new RankTier(RANK_ID, "Gold", 1, new BigDecimal("5000"));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rankTier));

        CompensationPlanResponse response = compensationPlanService.getCurrentPlan();

        assertThat(response.royaltyBonusRates()).hasSize(1);
        assertThat(response.royaltyBonusRates().get(0).rankId()).isEqualTo(RANK_ID);
        assertThat(response.royaltyBonusRates().get(0).rankName()).isEqualTo("Gold");
        assertThat(response.availableRanks()).hasSize(1);
        assertThat(response.availableRanks().get(0).name()).isEqualTo("Gold");
    }
}
