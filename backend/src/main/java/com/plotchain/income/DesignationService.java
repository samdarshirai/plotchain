package com.plotchain.income;

import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// An associate's visible title: the designation of the highest reward LEVEL they've achieved (has
// a REWARD ledger row), named by the CURRENT plan's tier for that level -- so it follows plan edits
// and ignores which plan version the row was written under. CycleService.refreshLiveIncome writes
// REWARD rows on every payment/void, so this promotes (and, on a void, reverts) immediately. No
// achieved level -> absent/null; the frontend falls back to its base "Sales Associate" label.
@Service
public class DesignationService {

    private final LedgerEntryRepository ledgerEntryRepository;
    private final CompensationPlanVersionRepository versionRepository;
    private final RewardTierRepository rewardTierRepository;

    public DesignationService(
        LedgerEntryRepository ledgerEntryRepository,
        CompensationPlanVersionRepository versionRepository,
        RewardTierRepository rewardTierRepository
    ) {
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.versionRepository = versionRepository;
        this.rewardTierRepository = rewardTierRepository;
    }

    public String designationOf(UUID associateId) {
        return designationsOf(List.of(associateId)).get(associateId);
    }

    public Map<UUID, String> designationsOf(Collection<UUID> associateIds) {
        if (associateIds.isEmpty()) {
            return Map.of();
        }
        Map<Integer, String> designationByLevel = currentDesignationsByLevel();
        Map<UUID, Integer> highestLevel = new HashMap<>();
        for (LedgerEntryRepository.AwardedRewardLevelRow row : ledgerEntryRepository.findAwardedRewardLevels(associateIds)) {
            if (designationByLevel.containsKey(row.getTierLevel())) {
                highestLevel.merge(row.getAssociateId(), row.getTierLevel(), Math::max);
            }
        }
        Map<UUID, String> result = new HashMap<>();
        highestLevel.forEach((associateId, level) -> result.put(associateId, designationByLevel.get(level)));
        return result;
    }

    private Map<Integer, String> currentDesignationsByLevel() {
        Map<Integer, String> byLevel = new HashMap<>();
        versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .ifPresent(version -> {
                for (RewardTier t : rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId())) {
                    if (t.getDesignation() != null && !t.getDesignation().isBlank()) {
                        byLevel.put(t.getTierLevel(), t.getDesignation());
                    }
                }
            });
        return byLevel;
    }
}
