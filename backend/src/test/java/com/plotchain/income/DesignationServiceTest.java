package com.plotchain.income;

import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DesignationServiceTest {

    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock CompensationPlanVersionRepository versionRepository;
    @Mock RewardTierRepository rewardTierRepository;
    @InjectMocks DesignationService service;

    private static LedgerEntryRepository.AwardedRewardLevelRow row(UUID associateId, int level) {
        return new LedgerEntryRepository.AwardedRewardLevelRow() {
            public UUID getAssociateId() { return associateId; }
            public int getTierLevel() { return level; }
        };
    }

    private void stubCurrentPlan(RewardTier... tiers) {
        CompensationPlanVersion version = mock(CompensationPlanVersion.class);
        UUID versionId = UUID.randomUUID();
        when(version.getId()).thenReturn(versionId);
        when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any(LocalDate.class)))
            .thenReturn(Optional.of(version));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(versionId)).thenReturn(List.of(tiers));
    }

    private static RewardTier tier(int level, String designation) {
        return new RewardTier(UUID.randomUUID(), UUID.randomUUID(), level, new BigDecimal("1000"),
            new BigDecimal("1"), null, designation);
    }

    @Test
    void namesTheHighestAwardedLevelWithTheCurrentPlansDesignation() {
        UUID me = UUID.randomUUID();
        stubCurrentPlan(tier(1, "Sales Executive"), tier(2, "Sr. Sales Executive"), tier(3, "Sales Manager"));
        // Levels 1 and 2 were awarded under an older plan version; only the level matters.
        when(ledgerEntryRepository.findAwardedRewardLevels(any())).thenReturn(List.of(row(me, 1), row(me, 2)));

        assertThat(service.designationOf(me)).isEqualTo("Sr. Sales Executive");
    }

    @Test
    void ignoresLevelsWhoseCurrentTierHasNoDesignationAndAssociatesWithNoRow() {
        UUID me = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        stubCurrentPlan(tier(1, "Sales Executive"), tier(2, " "));
        when(ledgerEntryRepository.findAwardedRewardLevels(any())).thenReturn(List.of(row(me, 1), row(me, 2)));

        Map<UUID, String> result = service.designationsOf(List.of(me, other));

        assertThat(result).containsEntry(me, "Sales Executive").doesNotContainKey(other);
    }
}
