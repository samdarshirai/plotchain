package com.plotchain.expense;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import com.plotchain.income.LedgerEntryRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

// Keeps one expense per achieved reward level whose tier carries a perk (type + value). Reward
// ledger rows are deleted and recomputed on every sale/void, so the expense is keyed by
// (associate, tier level), never by ledger id. Called by CycleService after each income run, in the
// same transaction: creates expenses for newly achieved perks, removes those whose reward no longer
// exists (a void reverted it). An existing expense is a snapshot: later plan edits don't change it.
@Service
public class RewardPerkExpenseService {

    private final LedgerEntryRepository ledgerEntryRepository;
    private final CompensationPlanVersionRepository versionRepository;
    private final RewardTierRepository rewardTierRepository;
    private final ExpenseRepository expenseRepository;
    private final AssociateRepository associateRepository;

    public RewardPerkExpenseService(
        LedgerEntryRepository ledgerEntryRepository,
        CompensationPlanVersionRepository versionRepository,
        RewardTierRepository rewardTierRepository,
        ExpenseRepository expenseRepository,
        AssociateRepository associateRepository
    ) {
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.versionRepository = versionRepository;
        this.rewardTierRepository = rewardTierRepository;
        this.expenseRepository = expenseRepository;
        this.associateRepository = associateRepository;
    }

    public void sync() {
        record Key(UUID associateId, int level) {}

        Set<Key> achieved = new HashSet<>();
        ledgerEntryRepository.findAllAwardedRewardLevels()
            .forEach(r -> achieved.add(new Key(r.getAssociateId(), r.getTierLevel())));

        Set<Key> existing = new HashSet<>();
        List<Expense> stale = expenseRepository.findBySourceAssociateIdIsNotNull().stream()
            .filter(e -> {
                Key k = new Key(e.getSourceAssociateId(), e.getSourceTierLevel());
                existing.add(k);
                return !achieved.contains(k);
            })
            .toList();
        if (!stale.isEmpty()) {
            expenseRepository.deleteAll(stale);
            expenseRepository.flush();
        }

        Map<Integer, RewardTier> perkTiers = new HashMap<>();
        versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .ifPresent(v -> rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(v.getId()).stream()
                .filter(t -> t.getPerkExpenseTypeId() != null && t.getPerkValue() != null)
                .forEach(t -> perkTiers.put(t.getTierLevel(), t)));

        List<Key> missing = achieved.stream()
            .filter(k -> perkTiers.containsKey(k.level()) && !existing.contains(k))
            .toList();
        if (missing.isEmpty()) {
            return;
        }
        Map<UUID, String> names = associateRepository
            .findAllById(missing.stream().map(Key::associateId).collect(Collectors.toSet())).stream()
            .collect(Collectors.toMap(Associate::getId, Associate::getName));
        LocalDate today = LocalDate.now();
        for (Key k : missing) {
            RewardTier tier = perkTiers.get(k.level());
            String remarks = "Reward perk: tier " + k.level()
                + (tier.getDesignation() == null || tier.getDesignation().isBlank() ? "" : " (" + tier.getDesignation() + ")");
            Expense e = new Expense(UUID.randomUUID(), today, tier.getPerkExpenseTypeId(), null,
                names.getOrDefault(k.associateId(), "Associate"), tier.getPerkValue(), PayMode.CASH, null, null, remarks);
            e.setRewardSource(k.associateId(), k.level());
            expenseRepository.save(e);
        }
    }
}
