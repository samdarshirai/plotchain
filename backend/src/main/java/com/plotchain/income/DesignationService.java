package com.plotchain.income;

import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// An associate's visible title: the designation of the highest reward tier they've achieved (has
// a REWARD ledger row). CycleService.refreshLiveIncome writes REWARD rows on every payment/void,
// so this promotes (and, on a void, reverts) immediately. No achieved tier -> absent/null; the
// frontend falls back to its base "Sales Executive" label.
@Service
public class DesignationService {

    private final LedgerEntryRepository ledgerEntryRepository;

    public DesignationService(LedgerEntryRepository ledgerEntryRepository) {
        this.ledgerEntryRepository = ledgerEntryRepository;
    }

    public String designationOf(UUID associateId) {
        return designationsOf(List.of(associateId)).get(associateId);
    }

    public Map<UUID, String> designationsOf(Collection<UUID> associateIds) {
        if (associateIds.isEmpty()) {
            return Map.of();
        }
        return ledgerEntryRepository.findAchievedRewardTiers(associateIds).stream()
            .filter(r -> r.getDesignation() != null && !r.getDesignation().isBlank())
            .collect(Collectors.groupingBy(
                LedgerEntryRepository.AchievedRewardTierRow::getAssociateId,
                Collectors.collectingAndThen(
                    Collectors.maxBy(Comparator.comparingInt(LedgerEntryRepository.AchievedRewardTierRow::getTierLevel)),
                    r -> r.get().getDesignation())));
    }
}
