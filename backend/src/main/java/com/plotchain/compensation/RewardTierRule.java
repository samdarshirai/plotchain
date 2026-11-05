package com.plotchain.compensation;

import com.plotchain.legvolume.LegVolumeRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

// The one rule for when a reward tier is reached. Leg volume resets after every level, so level N
// needs the SUM of thresholds 1..N in lifetime matched volume (min(left, right)). Used by both the
// reward awarding (CycleService) and the associate's reward ladder (LedgerService), so the two can
// never disagree about what is achieved.
public final class RewardTierRule {

    private RewardTierRule() {}

    // Cumulative matched volume at which each tier is reached; same order as `tiers` (ascending level).
    public static List<BigDecimal> cumulativeThresholds(List<RewardTier> tiers) {
        List<BigDecimal> result = new ArrayList<>();
        BigDecimal running = BigDecimal.ZERO;
        for (RewardTier tier : tiers) {
            running = running.add(tier.getVolumeThreshold());
            result.add(running);
        }
        return result;
    }

    // Lifetime matched volume as the associate sees it: closed-cycle leg totals plus the OPEN
    // cycle's leg sales, matched = min(left, right). The reward ladder and the rank-progress card
    // both use this. CycleService#creditReward reads cumulative_matched_volume (+ this cycle's
    // matched) instead because it runs for every associate at once; the two are equal by
    // construction (carry-forward keeps unmatched volume on its leg).
    public static BigDecimal lifetimeMatched(
        LegVolumeRepository.LegBusinessTotals closed, BigDecimal openLeft, BigDecimal openRight
    ) {
        return closed.left().add(openLeft).min(closed.right().add(openRight));
    }
}
