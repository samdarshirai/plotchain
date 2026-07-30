package com.plotchain.compensation;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    // @Transactional because a single call writes 1 version row + N royalty rows + M reward-tier
    // rows, and on the same-day replace path also DELETEs the previous version and its children
    // first. Without atomicity a crash mid-replace could leave the live plan with no active
    // version at all. (First service in this codebase to need it -- see report/notes.)
    @Transactional
    public CompensationPlanResponse updatePlan(CompensationPlanRequest request, UUID adminId) {
        // Contiguity validation MUST run before any repository write or delete, so a bad request
        // never creates a partial/orphaned version row nor destroys the existing one.
        validateRewardTierContiguity(request.rewardTiers());

        LocalDate effectiveFrom = request.effectiveFrom() != null ? request.effectiveFrom() : LocalDate.now();

        // idx_compensation_plan_version_effective_from (V8) allows at most one version per
        // calendar date, and the UI autosaves on a 400ms debounce -- so the second and every
        // later save of a given day lands here with a row already present.
        CompensationPlanVersion existing = versionRepository.findByEffectiveFrom(effectiveFrom).orElse(null);
        String versionLabel;
        boolean sameAuthor = existing != null
            && existing.getCreatedByAssociateId() != null
            && existing.getCreatedByAssociateId().equals(adminId);
        if (existing == null) {
            versionLabel = nextVersionLabel();
        } else if (!sameAuthor || !effectiveFrom.equals(LocalDate.now())) {
            // Null author = the V8 genesis seed row; a different non-null author = another
            // admin's edit; a past effectiveFrom (even by the same author) is an already-effective
            // historical version. None of these are ours to overwrite -- history stays immutable.
            // Only today's row, by its own author, is a continuation rather than history.
            throw new DuplicateEffectiveDateException(
                "A compensation plan version is already effective on " + effectiveFrom
                    + (existing.getCreatedByAssociateId() == null
                        ? "; it was not created by you"
                        : !sameAuthor
                            ? "; it belongs to a different administrator's edit"
                            : "; it is a past, already-effective version")
                    + " and cannot be replaced. Choose a different effective date.");
        } else {
            // Same admin, same calendar date (today): this is a continuation of today's edit, not
            // a new point in history. Replace the row (keeping its label) instead of appending.
            versionLabel = existing.getVersionLabel();
            replaceExistingVersion(existing);
        }

        CompensationPlanVersion newVersion = new CompensationPlanVersion(
            UUID.randomUUID(),
            versionLabel,
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

    // Deletes a same-day version and its child rows so the incoming save can take its place.
    // The explicit flush() matters: Hibernate would otherwise order the new version's INSERT
    // before this DELETE at commit time and trip the unique effective_from index (and the
    // children's FK). Runs inside updatePlan's transaction, so a failure after this point
    // rolls the deletes back.
    private void replaceExistingVersion(CompensationPlanVersion existing) {
        royaltyBonusRateRepository.deleteAll(royaltyBonusRateRepository.findAllByPlanVersionId(existing.getId()));
        rewardTierRepository.deleteAll(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(existing.getId()));
        versionRepository.delete(existing);
        versionRepository.flush();
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
