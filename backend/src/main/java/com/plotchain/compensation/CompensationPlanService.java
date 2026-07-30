package com.plotchain.compensation;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class CompensationPlanService {

    // Previous version_label is expected to look like "v<n>"; anything else (shouldn't happen
    // given the seeded genesis row) falls back to "v2" rather than throwing.
    private static final Pattern VERSION_LABEL_PATTERN = Pattern.compile("^v(\\d+)$");

    private final CompensationPlanVersionRepository versionRepository;
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
    private final RewardTierRepository rewardTierRepository;
    private final RankTierRepository rankTierRepository;

    public CompensationPlanService(
            CompensationPlanVersionRepository versionRepository,
            RoyaltyBonusRateRepository royaltyBonusRateRepository,
            RewardTierRepository rewardTierRepository,
            RankTierRepository rankTierRepository) {
        this.versionRepository = versionRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
        this.rewardTierRepository = rewardTierRepository;
        this.rankTierRepository = rankTierRepository;
    }

    public CompensationPlanResponse getCurrentPlan() {
        CompensationPlanVersion version = currentVersion();
        List<RoyaltyBonusRate> rates = royaltyBonusRateRepository.findAllByPlanVersionId(version.getId());
        List<RewardTier> tiers = rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId());
        return toResponse(version, rates, tiers);
    }

    public List<CompensationPlanSummaryResponse> getHistory() {
        return versionRepository.findAllByOrderByEffectiveFromDesc().stream()
            .map(v -> new CompensationPlanSummaryResponse(v.getVersionLabel(), v.getEffectiveFrom(), v.getCreatedAt()))
            .collect(Collectors.toList());
    }

    public CompensationPlanResponse updatePlan(CompensationPlanRequest request, UUID adminId) {
        // Contiguity validation MUST run before any repository write, so a bad request never
        // creates a partial/orphaned version row.
        validateRewardTierContiguity(request.rewardTiers());

        String nextVersionLabel = nextVersionLabel();
        LocalDate effectiveFrom = request.effectiveFrom() != null ? request.effectiveFrom() : LocalDate.now();

        CompensationPlanVersion newVersion = new CompensationPlanVersion(
            UUID.randomUUID(),
            nextVersionLabel,
            effectiveFrom,
            request.directIncomePct(),
            request.matchingIncomePct(),
            request.sponsorMatchingPct(),
            request.tdsPct(),
            request.adminChargeWithPanPct(),
            request.adminChargeWithoutPanPct(),
            request.activationFee(),
            request.minWithdrawal(),
            SettlementCycle.valueOf(request.settlementCycle()),
            Instant.now(),
            adminId
        );
        versionRepository.save(newVersion);

        List<RoyaltyBonusRate> savedRates = saveRoyaltyBonusRates(newVersion.getId(), request.royaltyBonusRates());
        List<RewardTier> savedTiers = saveRewardTiers(newVersion.getId(), request.rewardTiers());

        // Built directly from what was just saved, NOT via getCurrentPlan() -- effectiveFrom may
        // be future-dated, so the new version might not be "current" yet.
        return toResponse(newVersion, savedRates, savedTiers);
    }

    // True only once an admin has actually saved a version (created_by_associate_id set). The
    // seed row (V8 migration) has created_by_associate_id = NULL, so "a version row exists" is
    // never a valid completeness signal here -- unlike Company Profile/Branding, this table has
    // no blank-singleton state; every column is NOT NULL from the moment the migration runs.
    public boolean isComplete() {
        return currentVersion().getCreatedByAssociateId() != null;
    }

    private CompensationPlanVersion currentVersion() {
        return versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException(
                "compensation_plan_version row missing - V8 migration seeds it"));
    }

    private String nextVersionLabel() {
        String previousLabel = versionRepository.findFirstByOrderByCreatedAtDesc()
            .map(CompensationPlanVersion::getVersionLabel)
            .orElse(null);
        if (previousLabel != null) {
            Matcher matcher = VERSION_LABEL_PATTERN.matcher(previousLabel);
            if (matcher.matches()) {
                int next = Integer.parseInt(matcher.group(1)) + 1;
                return "v" + next;
            }
        }
        return "v2";
    }

    private List<RoyaltyBonusRate> saveRoyaltyBonusRates(UUID planVersionId, List<RoyaltyBonusRateInput> inputs) {
        if (inputs == null) {
            return List.of();
        }
        List<RoyaltyBonusRate> entities = inputs.stream()
            .map(input -> new RoyaltyBonusRate(UUID.randomUUID(), planVersionId, input.rankId(), input.royaltyPct()))
            .collect(Collectors.toList());
        entities.forEach(royaltyBonusRateRepository::save);
        return entities;
    }

    private List<RewardTier> saveRewardTiers(UUID planVersionId, List<RewardTierInput> inputs) {
        if (inputs == null) {
            return List.of();
        }
        List<RewardTier> entities = inputs.stream()
            .map(input -> new RewardTier(
                UUID.randomUUID(),
                planVersionId,
                input.tierLevel(),
                input.volumeThreshold(),
                input.cashReward(),
                input.perkDescription()))
            .collect(Collectors.toList());
        entities.forEach(rewardTierRepository::save);
        return entities;
    }

    // Gives concrete meaning to the spec's undefined "ordered, no gaps allowed"
    // (setup-onboarding-spec.md:60): sorted tier levels must equal exactly 1..n with no gaps or
    // duplicates, and each tier's volumeThreshold must strictly increase over the previous tier.
    private void validateRewardTierContiguity(List<RewardTierInput> tiers) {
        if (tiers == null || tiers.isEmpty()) {
            return;
        }
        List<RewardTierInput> sorted = tiers.stream()
            .sorted(Comparator.comparingInt(RewardTierInput::tierLevel))
            .collect(Collectors.toList());

        BigDecimal previousThreshold = null;
        for (int i = 0; i < sorted.size(); i++) {
            RewardTierInput tier = sorted.get(i);
            int expectedLevel = i + 1;
            if (tier.tierLevel() != expectedLevel) {
                throw new RewardTierGapException(
                    "Reward tier levels must be contiguous starting at 1 with no gaps or duplicates; "
                        + "expected level " + expectedLevel + " but found level " + tier.tierLevel());
            }
            if (previousThreshold != null && tier.volumeThreshold().compareTo(previousThreshold) <= 0) {
                throw new RewardTierGapException(
                    "Reward tier " + tier.tierLevel()
                        + " volume threshold must strictly increase over the previous tier");
            }
            previousThreshold = tier.volumeThreshold();
        }
    }

    private CompensationPlanResponse toResponse(
            CompensationPlanVersion version, List<RoyaltyBonusRate> rates, List<RewardTier> tiers) {
        List<RankTier> rankTiers = rankTierRepository.findAllByOrderByRankOrder();
        Map<UUID, String> rankNamesById = rankTiers.stream()
            .collect(Collectors.toMap(RankTier::getId, RankTier::getName));

        List<RoyaltyBonusRateDto> royaltyDtos = rates.stream()
            .map(r -> new RoyaltyBonusRateDto(r.getRankId(), rankNamesById.get(r.getRankId()), r.getRoyaltyPct()))
            .collect(Collectors.toList());

        List<RewardTierDto> tierDtos = tiers.stream()
            .map(t -> new RewardTierDto(t.getTierLevel(), t.getVolumeThreshold(), t.getCashReward(), t.getPerkDescription()))
            .collect(Collectors.toList());

        List<RankOptionDto> availableRanks = rankTiers.stream()
            .map(rt -> new RankOptionDto(rt.getId(), rt.getName()))
            .collect(Collectors.toList());

        return new CompensationPlanResponse(
            version.getVersionLabel(),
            version.getEffectiveFrom(),
            version.getDirectIncomePct(),
            version.getMatchingIncomePct(),
            version.getSponsorMatchingPct(),
            version.getTdsPct(),
            version.getAdminChargeWithPanPct(),
            version.getAdminChargeWithoutPanPct(),
            version.getActivationFee(),
            version.getMinWithdrawal(),
            version.getSettlementCycle().name(),
            royaltyDtos,
            tierDtos,
            availableRanks,
            version.getCreatedAt()
        );
    }
}
