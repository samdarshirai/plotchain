package com.plotchain.compensation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompensationPlanServiceTest {

    @Mock CompensationPlanVersionRepository versionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock RewardTierRepository rewardTierRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    CompensationPlanService compensationPlanService;

    private static final UUID RANK_ID = UUID.randomUUID();
    private static final UUID ADMIN_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        compensationPlanService = new CompensationPlanService(
            versionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository,
            settingsAuditService, associateRepository);
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
        return versionOn(LocalDate.now(), "v2", createdBy);
    }

    private CompensationPlanVersion versionOn(LocalDate effectiveFrom, String label, UUID createdBy) {
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
            List.of(new RoyaltyBonusRateInput(new BigDecimal("40"), new BigDecimal("3.00"))),
            tiers,
            effectiveFrom
        );
    }

    // -- getMyRankProgress --------------------------------------------------

    @Test
    void getMyRankProgressReturnsCurrentAndNextRankWithProgressAndRewardTiers() {
        UUID associateId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();
        UUID nextRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setCumulativeMatchedVolume(new BigDecimal("4000"));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, new BigDecimal("2000"));
        RankTier nextRank = new RankTier(nextRankId, "Sales Executive", 2, new BigDecimal("10000"));

        CompensationPlanVersion version = seedVersion();
        RewardTier achievedTier = new RewardTier(
            UUID.randomUUID(), version.getId(), 1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1");
        RewardTier unreachedTier = new RewardTier(
            UUID.randomUUID(), version.getId(), 2, new BigDecimal("5000"), new BigDecimal("500"), "Tier 2");

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank, nextRank));
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(version));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId()))
            .thenReturn(List.of(achievedTier, unreachedTier));

        AssociateRankProgressResponse response = compensationPlanService.getMyRankProgress(associateId);

        assertThat(response.currentRank()).isEqualTo("Sales Associate");
        assertThat(response.currentRankOrder()).isEqualTo(1);
        assertThat(response.nextRank()).isEqualTo("Sales Executive");
        // progressPercent = 4000 * 100 / 10000 = 40
        assertThat(response.progressPercent()).isEqualTo(40);
        assertThat(response.cumulativeMatchedVolume()).isEqualByComparingTo("4000");
        assertThat(response.volumeToNextRank()).isEqualByComparingTo("6000");
        assertThat(response.rewardTiers()).hasSize(2);
        assertThat(response.rewardTiers().get(0).tierLevel()).isEqualTo(1);
        assertThat(response.rewardTiers().get(0).achieved()).isTrue();
        assertThat(response.rewardTiers().get(1).tierLevel()).isEqualTo(2);
        assertThat(response.rewardTiers().get(1).achieved()).isFalse();
    }

    @Test
    void getMyRankProgressMarksATierAchievedWhenVolumeExactlyEqualsThreshold() {
        // Boundary case for the achieved predicate's <= comparison: cumulativeMatchedVolume
        // exactly equal to volumeThreshold (not strictly above, not strictly below) must still
        // count as achieved, mirroring CycleService#creditReward's own <= comparison.
        UUID associateId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setCumulativeMatchedVolume(new BigDecimal("1000"));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, new BigDecimal("500"));
        CompensationPlanVersion version = seedVersion();
        RewardTier exactThresholdTier = new RewardTier(
            UUID.randomUUID(), version.getId(), 1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1");

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(version));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId()))
            .thenReturn(List.of(exactThresholdTier));

        AssociateRankProgressResponse response = compensationPlanService.getMyRankProgress(associateId);

        assertThat(response.rewardTiers()).hasSize(1);
        assertThat(response.rewardTiers().get(0).achieved()).isTrue();
    }

    @Test
    void getMyRankProgressAtMaxRankReturnsNullNextRankAndFullProgress() {
        UUID associateId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setCumulativeMatchedVolume(new BigDecimal("50000"));

        RankTier currentRank = new RankTier(currentRankId, "Sales Legend", 5, new BigDecimal("40000"));
        CompensationPlanVersion version = seedVersion();

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(version));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId()))
            .thenReturn(List.of());

        AssociateRankProgressResponse response = compensationPlanService.getMyRankProgress(associateId);

        assertThat(response.nextRank()).isNull();
        assertThat(response.progressPercent()).isEqualTo(100);
        assertThat(response.volumeToNextRank()).isEqualByComparingTo("0");
        assertThat(response.rewardTiers()).isEmpty();
    }

    @Test
    void getMyRankProgressThrowsNoRankAssignedExceptionWhenAssociateHasNoRank() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(null);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> compensationPlanService.getMyRankProgress(associateId))
            .isInstanceOf(NoRankAssignedException.class);
    }

    @Test
    void getMyRankProgressThrowsAssociateNotFoundExceptionWhenAssociateDoesNotExist() {
        UUID associateId = UUID.randomUUID();
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> compensationPlanService.getMyRankProgress(associateId))
            .isInstanceOf(AssociateNotFoundException.class);
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

    @Test
    void updatePlanThrowsWhenEffectiveDateBelongsToADifferentAdmin() {
        lenient().when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        LocalDate effectiveFrom = LocalDate.now().plusDays(5);
        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1")
        );
        CompensationPlanRequest request = requestWithTiersAndEffectiveFrom(validTiers, effectiveFrom);

        // A version already exists for this date, authored by SOMEONE ELSE. Even though it is
        // the same calendar date, it is not this admin's edit to overwrite.
        UUID otherAdminId = UUID.randomUUID();
        when(versionRepository.findByEffectiveFrom(effectiveFrom))
            .thenReturn(Optional.of(versionOn(effectiveFrom, "v2", otherAdminId)));

        assertThatThrownBy(() -> compensationPlanService.updatePlan(request, ADMIN_ID))
            .isInstanceOf(DuplicateEffectiveDateException.class)
            .hasMessageContaining(effectiveFrom.toString())
            .hasMessageContaining("different administrator");

        verify(versionRepository, never()).save(any());
        verify(versionRepository, never()).delete(any());
    }

    @Test
    void updatePlanThrowsWhenEffectiveDateIsAPastDayEvenForTheSameAdmin() {
        lenient().when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        LocalDate effectiveFrom = LocalDate.now().minusDays(1);
        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1")
        );
        CompensationPlanRequest request = requestWithTiersAndEffectiveFrom(validTiers, effectiveFrom);

        // A version already exists for this date, authored by THIS SAME admin. Same-author replace
        // is only for continuing TODAY's edit -- a prior day's already-effective version must stay
        // immutable even to its own author.
        when(versionRepository.findByEffectiveFrom(effectiveFrom))
            .thenReturn(Optional.of(versionOn(effectiveFrom, "v2", ADMIN_ID)));

        assertThatThrownBy(() -> compensationPlanService.updatePlan(request, ADMIN_ID))
            .isInstanceOf(DuplicateEffectiveDateException.class)
            .hasMessageContaining(effectiveFrom.toString());

        verify(versionRepository, never()).save(any());
        verify(versionRepository, never()).delete(any());
    }

    @Test
    void updatePlanThrowsWhenEffectiveDateBelongsToTheGenesisSeedRowWithNoAuthor() {
        lenient().when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        // The V8 seed row has created_by_associate_id = NULL. No admin "owns" it, so nobody may
        // replace it -- not even by explicitly targeting its effective date.
        LocalDate seedDate = LocalDate.of(2000, 1, 1);
        when(versionRepository.findByEffectiveFrom(seedDate)).thenReturn(Optional.of(seedVersion()));

        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1")
        );

        assertThatThrownBy(() -> compensationPlanService.updatePlan(
                requestWithTiersAndEffectiveFrom(validTiers, seedDate), ADMIN_ID))
            .isInstanceOf(DuplicateEffectiveDateException.class)
            .hasMessageContaining("2000-01-01")
            .hasMessageContaining("not created by you");

        verify(versionRepository, never()).save(any());
        verify(versionRepository, never()).delete(any());
    }

    @Test
    void updatePlanReplacesTheSameDaysVersionBySameAdminKeepingItsVersionLabel() {
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        // The admin already autosaved once today -- the UI never sends effectiveFrom, so every
        // later keystroke's autosave lands on the same calendar date.
        LocalDate today = LocalDate.now();
        CompensationPlanVersion todaysVersion = versionOn(today, "v2", ADMIN_ID);
        when(versionRepository.findByEffectiveFrom(today)).thenReturn(Optional.of(todaysVersion));

        RoyaltyBonusRate staleRate =
            new RoyaltyBonusRate(UUID.randomUUID(), todaysVersion.getId(), new BigDecimal("40"), new BigDecimal("9.00"));
        RewardTier staleTier = new RewardTier(
            UUID.randomUUID(), todaysVersion.getId(), 1, new BigDecimal("5"), new BigDecimal("5"), "stale");
        when(royaltyBonusRateRepository.findAllByPlanVersionId(todaysVersion.getId()))
            .thenReturn(List.of(staleRate));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(todaysVersion.getId()))
            .thenReturn(List.of(staleTier));

        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1"),
            new RewardTierInput(2, new BigDecimal("2000"), new BigDecimal("200"), "Tier 2")
        );

        CompensationPlanResponse response = compensationPlanService.updatePlan(requestWithTiers(validTiers), ADMIN_ID);

        // Old version and its children are gone...
        verify(royaltyBonusRateRepository).deleteAll(List.of(staleRate));
        verify(rewardTierRepository).deleteAll(List.of(staleTier));
        verify(versionRepository).delete(todaysVersion);

        // ...and the replacement reuses the SAME label rather than incrementing per autosave.
        ArgumentCaptor<CompensationPlanVersion> captor = ArgumentCaptor.forClass(CompensationPlanVersion.class);
        verify(versionRepository).save(captor.capture());
        CompensationPlanVersion saved = captor.getValue();
        assertThat(saved.getVersionLabel()).isEqualTo("v2");
        assertThat(saved.getId()).isNotEqualTo(todaysVersion.getId());
        assertThat(saved.getEffectiveFrom()).isEqualTo(today);
        assertThat(saved.getCreatedByAssociateId()).isEqualTo(ADMIN_ID);
        assertThat(response.versionLabel()).isEqualTo("v2");

        // The label logic must not run at all on the replace path.
        verify(versionRepository, never()).findFirstByOrderByCreatedAtDesc();
        // New children were written against the NEW version id.
        verify(royaltyBonusRateRepository, times(1)).save(any());
        verify(rewardTierRepository, times(2)).save(any());
    }

    @Test
    void updatePlanRejectsBeforeDeletingAnythingWhenTiersAreInvalid() {
        // Contiguity must be checked before the replace path touches the existing version --
        // otherwise a malformed autosave would destroy today's plan and write nothing back.
        List<RewardTierInput> tiersWithGap = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1"),
            new RewardTierInput(3, new BigDecimal("2000"), new BigDecimal("200"), "Tier 3")
        );

        assertThatThrownBy(() -> compensationPlanService.updatePlan(requestWithTiers(tiersWithGap), ADMIN_ID))
            .isInstanceOf(RewardTierGapException.class);

        verify(versionRepository, never()).findByEffectiveFrom(any());
        verify(versionRepository, never()).delete(any());
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
    void getCurrentPlanReturnsVolumeSlabRoyaltyRatesAndAvailableRanks() {
        CompensationPlanVersion current = seedVersion();
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now()))
            .thenReturn(Optional.of(current));

        RoyaltyBonusRate rate = new RoyaltyBonusRate(UUID.randomUUID(), current.getId(), new BigDecimal("40"), new BigDecimal("3.00"));
        when(royaltyBonusRateRepository.findAllByPlanVersionId(current.getId())).thenReturn(List.of(rate));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(current.getId())).thenReturn(List.of());

        // availableRanks is populated independently of Royalty (Royalty is volume-keyed, not
        // rank-keyed) -- this RankTier just proves rankTierRepository is still consulted for it.
        RankTier rankTier = new RankTier(RANK_ID, "Gold", 1, new BigDecimal("5000"));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rankTier));

        CompensationPlanResponse response = compensationPlanService.getCurrentPlan();

        assertThat(response.royaltyBonusRates()).hasSize(1);
        assertThat(response.royaltyBonusRates().get(0).volumeThreshold()).isEqualByComparingTo("40");
        assertThat(response.royaltyBonusRates().get(0).royaltyPct()).isEqualByComparingTo("3.00");
        assertThat(response.availableRanks()).hasSize(1);
        assertThat(response.availableRanks().get(0).name()).isEqualTo("Gold");
    }

    // -- audit hook -------------------------------------------------------

    @Test
    void updatePlanRecordsAnAuditEntryForTheNewVersion() {
        when(versionRepository.findFirstByOrderByCreatedAtDesc()).thenReturn(Optional.of(seedVersion()));
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        List<RewardTierInput> validTiers = List.of(
            new RewardTierInput(1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1")
        );

        compensationPlanService.updatePlan(requestWithTiers(validTiers), ADMIN_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("COMPENSATION");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ADMIN_ID);
    }
}
