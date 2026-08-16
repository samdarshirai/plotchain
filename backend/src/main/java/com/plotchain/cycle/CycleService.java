package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class CycleService {

    private final CycleRepository cycleRepository;
    private final AssociateRepository associateRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final SaleRepository saleRepository;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final RankTierRepository rankTierRepository;
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
    private final RewardTierRepository rewardTierRepository;

    // Cycle-management unit 2 (GET /api/admin/cycles/{id}, spec lines 95-97): fixed order
    // matching the spec's literal "DIRECT/MATCHING/SPONSOR_MATCHING/ROYALTY/REWARD/SELF_PERFORMANCE"
    // listing, not IncomeType.values() filtered at call time -- explicit here so a future
    // IncomeType constant added before PERK can't silently join this breakdown without a
    // deliberate edit to this list. PERK itself is excluded: per Decision #8 of the domain-design
    // spec, it's descriptive metadata attached to REWARD entries, never its own ledger line.
    // SELF_PERFORMANCE was not part of docs/superpowers/specs/role-capability/
    // 2026-08-03-cycle-management-domain-design.md's original literal listing above (that spec
    // predates the self-performance-bonus feature) -- it's added here so the admin breakdown
    // doesn't silently omit real ledger money once self-performance bonuses start being credited.
    private static final List<IncomeType> BREAKDOWN_INCOME_TYPES = List.of(
        IncomeType.DIRECT, IncomeType.MATCHING, IncomeType.SPONSOR_MATCHING,
        IncomeType.ROYALTY, IncomeType.REWARD, IncomeType.SELF_PERFORMANCE);

    public CycleService(
        CycleRepository cycleRepository,
        AssociateRepository associateRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository,
        CompensationPlanVersionRepository compensationPlanVersionRepository,
        LedgerEntryRepository ledgerEntryRepository,
        RankTierRepository rankTierRepository,
        RoyaltyBonusRateRepository royaltyBonusRateRepository,
        RewardTierRepository rewardTierRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.rankTierRepository = rankTierRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
        this.rewardTierRepository = rewardTierRepository;
    }

    public CyclePageResponse list(CycleStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Cycle> result = status == null
            ? cycleRepository.findAllByOrderByPeriodStartDesc(pageable)
            : cycleRepository.findByStatusOrderByPeriodStartDesc(status, pageable);

        return new CyclePageResponse(
            result.getContent().stream().map(this::toSummary).toList(),
            page, size, result.getTotalElements());
    }

    // GET /api/admin/cycles/{id} -- cycle-management unit 2, the "monitor" half of
    // "trigger/monitor/re-run" (spec lines 95-97). Plain findById, no row lock: this is a
    // read-only view, unlike close()'s findByIdForUpdate, which exists solely to serialize
    // concurrent writers against the same cycle.
    public CycleDetailResponse getDetail(UUID id) {
        Cycle cycle = cycleRepository.findById(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        List<CycleIncomeTypeTotal> incomeTypeTotals = BREAKDOWN_INCOME_TYPES.stream()
            .map(type -> new CycleIncomeTypeTotal(
                type, ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), type)))
            .toList();

        BigDecimal totalNet = ledgerEntryRepository.sumNetAmountByCycle(cycle.getId());

        return new CycleDetailResponse(
            cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus(),
            incomeTypeTotals, totalNet);
    }

    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (leg-volume rollup) +
    // unit 5 (Matching Income) + unit 6 (Rank progression) + unit 7 (Sponsor Matching) + unit 8
    // (Royalty) + unit 9 (Reward) --
    // docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 3, 4, 5, 6, 7, 8. Every flow step (1-8) this
    // batch calls for is now implemented; unit 10 is atomicity/re-run hardening across the whole
    // pipeline above, not a new flow step of its own.
    @Transactional
    public CycleCloseResponse close(UUID id) {
        Cycle cycle = cycleRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        if (cycle.getStatus() != CycleStatus.OPEN) {
            throw new CycleAlreadyClosedException(cycle.getId());
        }

        // Flow step 1 (partial): write only, not a separate commit -- Decision #2 -- so this
        // isn't externally observable mid-batch under this design, and rolls back along with
        // everything else if a later step throws.
        cycle.setStatus(CycleStatus.CALCULATING);
        cycleRepository.save(cycle);

        List<Associate> associates = associateRepository.findAll();
        List<Sale> sales = saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);

        // Flow step 2.
        List<LegVolume> legVolumes = rollUpLegVolumes(cycle.getId(), associates, sales);
        legVolumeRepository.saveAll(legVolumes);

        // Flow step 3 (Decision #10): resolved once per batch run, against cycle.getPeriodStart()
        // -- deliberately not LocalDate.now() -- so a plan version an admin publishes after this
        // cycle's period already ended never retroactively changes the rate this cycle's volume
        // was earned under. Same missing-version convention as SaleService/DashboardService.
        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart())
            .orElseThrow(() -> new IllegalStateException(
                "compensation_plan_version row missing - V8 migration seeds it"));
        creditMatchingIncome(cycle.getId(), associates, legVolumes, planVersion);

        // Flow step 4 (Decision #7): advance rankId for each ASSOCIATE-role associate to the
        // highest RankTier their updated cumulativeMatchedVolume now qualifies for. Never
        // demotes. Skipped for ADMIN and the four staff roles (see advanceRanks' own comment).
        advanceRanks(associates);

        // Flow step 5 (Decision #9): second pass, requires step 3 (creditMatchingIncome) complete
        // tree-wide. One SPONSOR_MATCHING entry per direct sponsee who earned Matching Income this
        // cycle, credited to their sponsor. No role guard -- applies to Admin in full (Decision #7:
        // "Matching and Sponsor Matching... are unaffected and do apply to Admin in full").
        creditSponsorMatching(cycle.getId(), associates, planVersion);

        // Flow step 6 (Decision #7, #10, #11, #12): Royalty at the associate's POST-rank-advancement
        // rank (step 4, above) -- an achievement crossed this cycle earns this cycle's royalty
        // rate immediately. No-op per associate when no RoyaltyBonusRate is configured for their
        // rank (not an error -- some low ranks have none). Guard is role == ASSOCIATE, same
        // reasoning as advanceRanks' own guard: rank_id is null for Admin AND the four staff
        // roles (chk_associate_rank_required, V4), not just Admin.
        creditRoyalty(cycle.getId(), associates, legVolumes, planVersion);

        // Flow step 7 (Decision #8): for EVERY associate, including Admin -- RewardTier has no FK
        // to rank_tier, so nothing here excludes any role, unlike Royalty above. Idempotency is
        // checked WITHOUT a cycleId (Decision #8: a tier is awarded once EVER, in whichever cycle
        // first crosses it). This is this unit's own insertion point; unit 10's atomicity/re-run
        // hardening depends on this step existing but is not expected to insert a new call here.
        // matchedVolumeThisCycle mirrors the exact same min(left,right) predicate creditMatchingIncome
        // (step 3) used, re-derived independently from legVolumes rather than threaded through
        // creditMatchingIncome's own signature.
        Map<UUID, BigDecimal> matchedVolumeThisCycle = new HashMap<>();
        for (LegVolume legVolume : legVolumes) {
            matchedVolumeThisCycle.put(legVolume.getAssociateId(),
                legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume()));
        }
        creditReward(cycle.getId(), associates, matchedVolumeThisCycle, planVersion);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
        // so it runs inside the transaction this @Transactional method's proxy already started
        // -- exactly what Decision #1/#8 require, with no separate commit.
        cycle.setStatus(CycleStatus.CLOSED);
        cycleRepository.save(cycle);
        Cycle nextCycle = getOrOpenCurrent();

        return new CycleCloseResponse(cycle.getId(), cycle.getStatus(), legVolumes.size(), nextCycle.getId());
    }

    // Decision #4: a single in-memory post-order DFS pass, not N recursive SQL queries. Builds
    // parent->children adjacency from a plain findAll() (this decision's own "load every
    // Associate ... into memory once" language, and this platform's expected scale per the
    // spec's Open Question #1, don't call for a leaner projection query), then walks every root
    // (parentId == null -- exactly one in production, the Admin; zero in an associate-less
    // environment like this codebase's own CycleCloseConcurrencyTest fixture, which then simply
    // rolls up nothing rather than throwing).
    private List<LegVolume> rollUpLegVolumes(UUID cycleId, List<Associate> associates, List<Sale> sales) {
        Map<UUID, BigDecimal> ownSaleVolume = new HashMap<>();
        for (Sale sale : sales) {
            ownSaleVolume.merge(sale.getAssociateId(), sale.getAmount(), BigDecimal::add);
        }

        Map<UUID, Associate> leftChildOf = new HashMap<>();
        Map<UUID, Associate> rightChildOf = new HashMap<>();
        List<UUID> rootIds = new ArrayList<>();
        for (Associate associate : associates) {
            UUID parentId = associate.getParentId();
            if (parentId == null) {
                rootIds.add(associate.getId());
            } else if ("R".equals(associate.getPosition())) {
                rightChildOf.put(parentId, associate);
            } else {
                leftChildOf.put(parentId, associate);
            }
        }

        UUID previousClosedCycleId = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)
            .map(Cycle::getId)
            .orElse(null);

        List<LegVolume> legVolumes = new ArrayList<>();
        for (UUID rootId : rootIds) {
            rollUpSubtree(rootId, cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);
        }
        return legVolumes;
    }

    // Post-order: recurses into both children before computing this node's own subtreeVolume,
    // matching Decision #4's subtreeVolume(node) = own + subtreeVolume(left) + subtreeVolume(right)
    // (0 for a missing child). Appends exactly one LegVolume row for this node to legVolumes
    // (unconditionally, even all-zero) before returning, and returns this node's subtreeVolume
    // so its parent's own call can consume it as one of its two child terms.
    private BigDecimal rollUpSubtree(
        UUID associateId,
        UUID cycleId,
        UUID previousClosedCycleId,
        Map<UUID, BigDecimal> ownSaleVolume,
        Map<UUID, Associate> leftChildOf,
        Map<UUID, Associate> rightChildOf,
        List<LegVolume> legVolumes
    ) {
        Associate leftChild = leftChildOf.get(associateId);
        Associate rightChild = rightChildOf.get(associateId);

        BigDecimal leftSubtreeVolume = leftChild == null
            ? BigDecimal.ZERO
            : rollUpSubtree(leftChild.getId(), cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);
        BigDecimal rightSubtreeVolume = rightChild == null
            ? BigDecimal.ZERO
            : rollUpSubtree(rightChild.getId(), cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);

        BigDecimal ownVolume = ownSaleVolume.getOrDefault(associateId, BigDecimal.ZERO);
        BigDecimal subtreeVolume = ownVolume.add(leftSubtreeVolume).add(rightSubtreeVolume);

        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (leftChild != null || rightChild != null) {
            BigDecimal carriedForwardLeft = BigDecimal.ZERO;
            BigDecimal carriedForwardRight = BigDecimal.ZERO;
            if (previousClosedCycleId != null) {
                LegVolume priorCycleLegVolume = legVolumeRepository
                    .findByAssociateIdAndCycleId(associateId, previousClosedCycleId)
                    .orElse(null);
                if (priorCycleLegVolume != null) {
                    carriedForwardLeft = priorCycleLegVolume.getCarriedForwardLeft();
                    carriedForwardRight = priorCycleLegVolume.getCarriedForwardRight();
                }
            }
            leftLegVolume = leftSubtreeVolume.add(carriedForwardLeft);
            rightLegVolume = rightSubtreeVolume.add(carriedForwardRight);
        }

        legVolumes.add(new LegVolume(
            UUID.randomUUID(), associateId, cycleId, leftLegVolume, rightLegVolume, BigDecimal.ZERO, BigDecimal.ZERO));

        return subtreeVolume;
    }

    // Flow step 3 (Decision #5, #6, #10, #11, #12): one MATCHING LedgerEntry per associate whose
    // just-computed LegVolume row (this exact cycle's, unit 4's rollup) has min(left,right) > 0.
    // All of write-entry / carry-forward-excess / increment-cumulativeMatchedVolume happen inside
    // the same min > 0 guard -- a zero-matched associate's row is left untouched (its unmatched
    // leg, if any, is not carried forward under this unit's implementation; that's the spec's
    // Flow step 3 text taken literally, not an oversight).
    // Cycle-management unit 8 (Royalty): extracted out of creditMatchingIncome (unit 5) and
    // creditSponsorMatching (unit 7), which had each inline-duplicated this exact math (Decision
    // #10). Unit 7's own code review flagged that a third inline copy in creditRoyalty would be
    // one copy too many -- see docs/superpowers/plans/2026-08-03-cycle-management-units.md's
    // "Also flagged, non-blocking" note. Bundled as a record (not three separate return values)
    // because every caller needs tds/admin/net together to populate one LedgerEntry.
    private record Deductions(BigDecimal tdsDeduction, BigDecimal adminDeduction, BigDecimal netAmount) {}

    // Decision #10: tdsDeduction = gross * tdsPct/100, adminDeduction = gross *
    // adminChargeWithoutPanPct/100 (always the without-PAN tier -- Associate has no pan_number
    // field), netAmount = gross - tds - admin. planVersion is the single CompensationPlanVersion
    // resolved once per close() run against cycle.getPeriodStart() (Decision #10) -- every income
    // type in this batch shares that one resolved version; no caller re-resolves its own.
    private Deductions applyDeductions(BigDecimal grossAmount, CompensationPlanVersion planVersion) {
        BigDecimal tdsDeduction = grossAmount.multiply(
            planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal adminDeduction = grossAmount.multiply(
            planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal netAmount = grossAmount.subtract(tdsDeduction).subtract(adminDeduction);
        return new Deductions(tdsDeduction, adminDeduction, netAmount);
    }

    // Decision #11: VERIFIED KYC -> PENDING (computed, not yet paid); anything else (PENDING or
    // REJECTED KYC) -> CARRIED_FORWARD (computed correctly, withheld pending KYC verification).
    // Every income type in this batch gates on the CREDITED associate's own kycStatus -- for
    // Sponsor Matching that's the sponsor, not the sponsee whose entry triggered the credit;
    // callers pass whichever associate is actually being paid by the entry under construction.
    private LedgerEntryStatus kycGatedStatus(Associate associate) {
        return associate.getKycStatus() == KycStatus.VERIFIED
            ? LedgerEntryStatus.PENDING
            : LedgerEntryStatus.CARRIED_FORWARD;
    }

    private void creditMatchingIncome(
        UUID cycleId,
        List<Associate> associates,
        List<LegVolume> legVolumes,
        CompensationPlanVersion planVersion
    ) {
        Map<UUID, Associate> associatesById = new HashMap<>();
        for (Associate associate : associates) {
            associatesById.put(associate.getId(), associate);
        }

        for (LegVolume legVolume : legVolumes) {
            BigDecimal matchedVolume = legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume());
            if (matchedVolume.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Associate associate = associatesById.get(legVolume.getAssociateId());

            // Decision #12: check-then-insert. A hit here skips the whole block below -- entry,
            // carried-forward mutation, and cumulativeMatchedVolume increment together -- so a
            // skipped write can never partially double-count.
            boolean alreadyCredited = ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
                associate.getId(), cycleId, IncomeType.MATCHING, legVolume.getId());
            if (alreadyCredited) {
                continue;
            }

            BigDecimal grossAmount = matchedVolume.multiply(
                planVersion.getMatchingIncomePct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            Deductions deductions = applyDeductions(grossAmount, planVersion);

            LedgerEntry entry = new LedgerEntry();
            entry.setId(UUID.randomUUID());
            entry.setAssociateId(associate.getId());
            entry.setIncomeType(IncomeType.MATCHING);
            entry.setCycleId(cycleId);
            entry.setGrossAmount(grossAmount);
            entry.setTdsDeduction(deductions.tdsDeduction());
            entry.setAdminDeduction(deductions.adminDeduction());
            entry.setNetAmount(deductions.netAmount());
            entry.setStatus(kycGatedStatus(associate));
            entry.setSourceRef(legVolume.getId());
            entry.setCreatedAt(Instant.now());
            ledgerEntryRepository.save(entry);

            // Decision #5: excess on the larger leg carries forward on this SAME row for unit 4's
            // rollup to consume next cycle -- never a new row.
            if (legVolume.getLeftLegVolume().compareTo(legVolume.getRightLegVolume()) > 0) {
                legVolume.setCarriedForwardLeft(legVolume.getLeftLegVolume().subtract(legVolume.getRightLegVolume()));
            } else if (legVolume.getRightLegVolume().compareTo(legVolume.getLeftLegVolume()) > 0) {
                legVolume.setCarriedForwardRight(legVolume.getRightLegVolume().subtract(legVolume.getLeftLegVolume()));
            }
            legVolumeRepository.save(legVolume);

            // Decision #6: raw matched volume, not the post-percentage income amount.
            associate.setCumulativeMatchedVolume(associate.getCumulativeMatchedVolume().add(matchedVolume));
            associateRepository.save(associate);
        }
    }

    // Flow step 4 (Decision #7): for each ASSOCIATE-role associate, advance rankId to the
    // highest RankTier whose volumeThreshold is now met by the just-updated
    // cumulativeMatchedVolume (Decision #6, already incremented by creditMatchingIncome above,
    // for every associate in this cycle -- not just those with a Matching entry this cycle, see
    // the plan's "Resolved open question 1"). Never demotes: a candidate only wins if its
    // rankOrder is strictly greater than the associate's CURRENT rank's rankOrder, so a
    // cumulativeMatchedVolume that (defensively; it shouldn't per Decision #6) failed to
    // monotonically increase can never lower rankId.
    //
    // Guard is role == ASSOCIATE, not role != ADMIN: chk_associate_rank_required
    // (V4__user_id_login_and_admin_roles.sql) reads `role <> 'ASSOCIATE' OR rank_id IS NOT NULL`
    // -- rank_id is required ONLY for ASSOCIATE, nullable for ADMIN *and* the four staff roles
    // (SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT; provisioned with rankId = null, same as
    // AdminBootstrapRunner does for ADMIN). Excluding only ADMIN
    // here would leave staff rows structurally eligible for a rank advancement that's exactly as
    // semantically meaningless for them as it is for Admin -- V4's own migration comment says it
    // plainly: "only associates have a rank."
    private void advanceRanks(List<Associate> associates) {
        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
        if (ranks.isEmpty()) {
            return;
        }

        Map<UUID, RankTier> ranksById = new HashMap<>();
        for (RankTier rank : ranks) {
            ranksById.put(rank.getId(), rank);
        }

        for (Associate associate : associates) {
            if (associate.getRole() != AssociateRole.ASSOCIATE) {
                continue;
            }

            // ranks is ascending by rankOrder; keep overwriting so the last candidate that
            // individually qualifies is the one with the highest rankOrder among ALL qualifying
            // tiers -- correct even if volumeThreshold isn't strictly monotonic with rankOrder.
            RankTier highestQualified = null;
            for (RankTier candidate : ranks) {
                if (candidate.getVolumeThreshold().compareTo(associate.getCumulativeMatchedVolume()) <= 0) {
                    highestQualified = candidate;
                }
            }
            if (highestQualified == null) {
                continue;
            }

            RankTier currentRank = associate.getRankId() == null ? null : ranksById.get(associate.getRankId());
            int currentRankOrder = currentRank == null ? Integer.MIN_VALUE : currentRank.getRankOrder();
            if (highestQualified.getRankOrder() > currentRankOrder) {
                associate.setRankId(highestQualified.getId());
                associateRepository.save(associate);
            }
        }
    }

    // Flow step 5 (Decision #9, #10, #11, #12): iterate over `associates` once as candidate
    // SPONSORS (not sponsees -- see this unit's plan for why this is the equivalent, non-redundant
    // reading of Decision #9's prose). For each candidate sponsor's direct sponsees
    // (findBySponsorId), look up that sponsee's Matching LedgerEntry for THIS cycle via a fresh
    // repository query (deliberately not an in-memory carry-over from creditMatchingIncome -- see
    // this unit's plan's Global Constraints for the full correctness/simplicity tradeoff writeup).
    // If the sponsee has one, credit the sponsor a SPONSOR_MATCHING entry: grossAmount is a
    // percentage of the sponsee's Matching grossAmount (never netAmount -- deductions apply once,
    // per-entry, at creation), sourceRef = that Matching entry's id. Deductions and KYC-gating use
    // the SPONSOR's own numbers/kycStatus -- the sponsor is who this entry pays. No role guard:
    // unlike Rank/Royalty, this applies to Admin in full (Decision #7).
    private void creditSponsorMatching(
        UUID cycleId,
        List<Associate> associates,
        CompensationPlanVersion planVersion
    ) {
        for (Associate sponsor : associates) {
            List<Associate> directSponsees = associateRepository.findBySponsorId(sponsor.getId());

            for (Associate sponsee : directSponsees) {
                Optional<LedgerEntry> sponseeMatchingEntry = ledgerEntryRepository
                    .findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycleId, IncomeType.MATCHING);
                if (sponseeMatchingEntry.isEmpty()) {
                    continue;
                }
                LedgerEntry matchingEntry = sponseeMatchingEntry.get();

                // Decision #12: check-then-insert, same pattern as creditMatchingIncome.
                boolean alreadyCredited = ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
                    sponsor.getId(), cycleId, IncomeType.SPONSOR_MATCHING, matchingEntry.getId());
                if (alreadyCredited) {
                    continue;
                }

                // Decision #9: percentage of the sponsee's Matching grossAmount, never netAmount.
                BigDecimal grossAmount = matchingEntry.getGrossAmount().multiply(
                    planVersion.getSponsorMatchingPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

                Deductions deductions = applyDeductions(grossAmount, planVersion);

                LedgerEntry entry = new LedgerEntry();
                entry.setId(UUID.randomUUID());
                entry.setAssociateId(sponsor.getId());
                entry.setIncomeType(IncomeType.SPONSOR_MATCHING);
                entry.setCycleId(cycleId);
                entry.setGrossAmount(grossAmount);
                entry.setTdsDeduction(deductions.tdsDeduction());
                entry.setAdminDeduction(deductions.adminDeduction());
                entry.setNetAmount(deductions.netAmount());
                entry.setStatus(kycGatedStatus(sponsor));
                entry.setSourceRef(matchingEntry.getId());
                entry.setCreatedAt(Instant.now());
                ledgerEntryRepository.save(entry);
            }
        }
    }

    // Flow step 6 (Decision #7, #10, #11, #12): for each associate whose just-computed
    // matched-pair volume this cycle is positive -- recomputed here as
    // min(legVolume.leftLegVolume, legVolume.rightLegVolume), the exact same predicate
    // creditMatchingIncome (step 3) uses to decide whether it wrote a MATCHING entry, since
    // creditMatchingIncome never mutates leftLegVolume/rightLegVolume themselves (only
    // carriedForwardLeft/Right) -- look up the RoyaltyBonusRate slab whose volumeThreshold is the
    // highest one not exceeding this matched volume (compensation-plan-reference.md §3:
    // "Royalty Bonus will Calculate on the Bonus of New Matching Business in a Single Closing" --
    // volume-keyed, not rank-keyed; rank was this method's original, since-corrected lookup key).
    // No slab configured at or below this matched volume -> no-op, not an error. Guard is
    // role == ASSOCIATE, same reasoning as advanceRanks' own guard (Admin and the four staff
    // roles have no rank_id, chk_associate_rank_required, V4) -- Royalty stays associate-only even
    // though its rate lookup no longer touches rank_id at all. sourceRef = legVolume.id, the same
    // row Matching used for this associate+cycle (Decision #12: "both derive from the same
    // cycle-computed matched-pair volume").
    private void creditRoyalty(
        UUID cycleId,
        List<Associate> associates,
        List<LegVolume> legVolumes,
        CompensationPlanVersion planVersion
    ) {
        Map<UUID, Associate> associatesById = new HashMap<>();
        for (Associate associate : associates) {
            associatesById.put(associate.getId(), associate);
        }

        for (LegVolume legVolume : legVolumes) {
            BigDecimal matchedVolume = legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume());
            if (matchedVolume.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Associate associate = associatesById.get(legVolume.getAssociateId());
            if (associate.getRole() != AssociateRole.ASSOCIATE) {
                continue;
            }

            Optional<RoyaltyBonusRate> rate = royaltyBonusRateRepository
                .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
                    planVersion.getId(), matchedVolume);
            if (rate.isEmpty()) {
                continue;
            }

            // Decision #12: check-then-insert, same pattern as creditMatchingIncome/creditSponsorMatching.
            boolean alreadyCredited = ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
                associate.getId(), cycleId, IncomeType.ROYALTY, legVolume.getId());
            if (alreadyCredited) {
                continue;
            }

            BigDecimal grossAmount = matchedVolume.multiply(
                rate.get().getRoyaltyPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Deductions deductions = applyDeductions(grossAmount, planVersion);

            LedgerEntry entry = new LedgerEntry();
            entry.setId(UUID.randomUUID());
            entry.setAssociateId(associate.getId());
            entry.setIncomeType(IncomeType.ROYALTY);
            entry.setCycleId(cycleId);
            entry.setGrossAmount(grossAmount);
            entry.setTdsDeduction(deductions.tdsDeduction());
            entry.setAdminDeduction(deductions.adminDeduction());
            entry.setNetAmount(deductions.netAmount());
            entry.setStatus(kycGatedStatus(associate));
            entry.setSourceRef(legVolume.getId());
            entry.setCreatedAt(Instant.now());
            ledgerEntryRepository.save(entry);
        }
    }

    // Flow step 7: for EVERY associate (Admin included -- RewardTier has no FK to rank_tier,
    // unlike Royalty, so nothing here excludes any role), walk RewardTiers in ascending
    // tierLevel order (findAllByPlanVersionIdOrderByTierLevel, already ordered) and consume this
    // cycle's matched volume (matchedVolumeThisCycle, the same min(left,right) value
    // creditMatchingIncome used) plus any volume carried forward from a prior cycle
    // (Associate.rewardVolumeCarriedForward) sequentially against each tier's INCREMENT over the
    // previous tier's threshold -- not the tier's absolute threshold, and not a plain
    // cumulativeMatchedVolume >= comparison. A tier is only cleared when the available pool
    // STRICTLY EXCEEDS its increment (not merely reaches it): compensation-plan-reference.md §4's
    // own worked examples ("Congrats! On 10 Lakh Pair of Sales & reaching Level 1, Remaining
    // 5 Lakh will be carried forward for the next level target") show an associate landing exactly
    // on a tier's absolute threshold clears only the tier below it, with the remainder carried
    // forward -- the same leftover-carry-forward shape creditMatchingIncome already uses for leg
    // volumes. Any amount left after the loop (because it wasn't enough to exceed the next
    // not-yet-awarded tier's increment) is written back to rewardVolumeCarriedForward for next
    // cycle's run to pick up. Idempotency is checked WITHOUT a cycleId filter
    // (existsByAssociateIdAndIncomeTypeAndSourceRef, deliberately narrower than the other four
    // income types' cycle-scoped equivalent) -- a tier is awarded once EVER; an already-awarded
    // tier's increment is skipped without being re-consumed from the pool (it was already spent
    // when it was first awarded). Multiple tiers can still be newly-crossed in a single cycle --
    // each gets its own entry, sourceRef = tier.id. perkDescription is never written as its own
    // ledger line: it's descriptive metadata reachable by looking up the RewardTier row this
    // entry's sourceRef points to.
    private void creditReward(
        UUID cycleId,
        List<Associate> associates,
        Map<UUID, BigDecimal> matchedVolumeThisCycle,
        CompensationPlanVersion planVersion
    ) {
        List<RewardTier> tiers = rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId());
        if (tiers.isEmpty()) {
            return;
        }

        for (Associate associate : associates) {
            BigDecimal available = matchedVolumeThisCycle
                .getOrDefault(associate.getId(), BigDecimal.ZERO)
                .add(associate.getRewardVolumeCarriedForward());
            BigDecimal previousThreshold = BigDecimal.ZERO;

            for (RewardTier tier : tiers) {
                BigDecimal increment = tier.getVolumeThreshold().subtract(previousThreshold);

                boolean alreadyAwarded = ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
                    associate.getId(), IncomeType.REWARD, tier.getId());
                if (alreadyAwarded) {
                    previousThreshold = tier.getVolumeThreshold();
                    continue;
                }

                if (available.compareTo(increment) <= 0) {
                    break;
                }

                BigDecimal grossAmount = tier.getCashReward();
                if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

                Deductions deductions = applyDeductions(grossAmount, planVersion);

                LedgerEntry entry = new LedgerEntry();
                entry.setId(UUID.randomUUID());
                entry.setAssociateId(associate.getId());
                entry.setIncomeType(IncomeType.REWARD);
                entry.setCycleId(cycleId);
                entry.setGrossAmount(grossAmount);
                entry.setTdsDeduction(deductions.tdsDeduction());
                entry.setAdminDeduction(deductions.adminDeduction());
                entry.setNetAmount(deductions.netAmount());
                entry.setStatus(kycGatedStatus(associate));
                entry.setSourceRef(tier.getId());
                entry.setCreatedAt(Instant.now());
                ledgerEntryRepository.save(entry);

                available = available.subtract(increment);
                previousThreshold = tier.getVolumeThreshold();
            }

            associate.setRewardVolumeCarriedForward(available);
            associateRepository.save(associate);
        }
    }

    // Sales unit 1 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // Decision 5): returns today's OPEN cycle under the PRD's 1st-15th / 16th-end-of-month
    // cadence, creating one only if no existing cycle covers today. Reuses the existing
    // findFirstByStatusOrderByPeriodStartDesc query rather than adding a new repository method,
    // since at most one OPEN cycle is expected to exist at a time; if the most recent OPEN
    // cycle's stored period doesn't cover today (e.g. it's stale), a new cycle is created for
    // today's period without inspecting older OPEN cycles.
    public Cycle getOrOpenCurrent() {
        LocalDate today = LocalDate.now();

        return cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .filter(cycle -> covers(cycle, today))
            .orElseGet(() -> openNewCycle(today));
    }

    private boolean covers(Cycle cycle, LocalDate date) {
        return !date.isBefore(cycle.getPeriodStart()) && !date.isAfter(cycle.getPeriodEnd());
    }

    private Cycle openNewCycle(LocalDate today) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(periodStartFor(today));
        cycle.setPeriodEnd(periodEndFor(today));
        cycle.setStatus(CycleStatus.OPEN);
        return cycleRepository.save(cycle);
    }

    private LocalDate periodStartFor(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate periodEndFor(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        return new CycleSummaryResponse(cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus());
    }
}
