package com.plotchain.compensation;

import java.math.BigDecimal;

// role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Compensation rules" row): the Associate-facing counterpart to RewardTierDto (admin), with an
// added `achieved` flag. `achieved` is true once the associate's cumulativeMatchedVolume has
// crossed this tier's volumeThreshold -- the exact predicate CycleService#creditReward uses to
// decide whether a tier's cash reward gets credited at cycle close
// (tier.getVolumeThreshold().compareTo(cumulativeMatchedVolume) <= 0).
//
// Deliberately NOT cross-referenced against LedgerEntryRepository's awarded-ledger-entry check:
// a zero-cashReward tier (pure perk, no cash component) never gets a LedgerEntry at all (see
// CycleService#creditReward's own grossAmount <= 0 guard), so a ledger-sourced "awarded" flag
// would read as permanently false for such a tier even after it's genuinely been reached.
// Comparing volume directly sidesteps that mismatch and needs no dependency on the income
// package.
public record AssociateRewardTierDto(
    int tierLevel,
    BigDecimal volumeThreshold,
    BigDecimal cashReward,
    String perkDescription,
    boolean achieved
) {}
