package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanService;
import com.plotchain.compensation.RewardTier;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 2): one service backs both the admin register and (a follow-up unit's) associate-self
// endpoint -- there's no write path here to justify splitting into separate classes, same
// reasoning the Sales spec gave for keeping SaleService as one class behind two controllers.
@Service
public class LedgerService {

    private final LedgerEntryRepository ledgerEntryRepository;
    private final AssociateRepository associateRepository;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final CompensationPlanService compensationPlanService;

    public LedgerService(
            LedgerEntryRepository ledgerEntryRepository,
            AssociateRepository associateRepository,
            CycleRepository cycleRepository,
            LegVolumeRepository legVolumeRepository,
            CompensationPlanService compensationPlanService) {
        this.compensationPlanService = compensationPlanService;
        this.legVolumeRepository = legVolumeRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.associateRepository = associateRepository;
        this.cycleRepository = cycleRepository;
    }

    // Flow "Admin ledger register" (same spec doc, steps 1-7): full cross-associate visibility.
    // Batch-resolves associate identity and cycle dates once per page, mapped by id -- the same
    // pattern AdminAssociateService.ranksById() already establishes -- rather than querying once
    // per row.
    public AdminLedgerPageResponse adminList(
            UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size) {
        Page<LedgerEntry> result = ledgerEntryRepository.search(
            associateId, incomeType, cycleId, status, PageRequest.of(page, size));

        List<LedgerEntry> content = result.getContent();
        Map<UUID, Associate> associatesById = associatesById(content);
        Map<UUID, Cycle> cyclesById = cyclesById(content);

        List<AdminLedgerEntryResponse> entries = content.stream()
            .map(e -> toAdminResponse(e, associatesById.get(e.getAssociateId()), cyclesById.get(e.getCycleId())))
            .toList();
        return new AdminLedgerPageResponse(entries, page, size, result.getTotalElements());
    }

    // Flow "Associate own ledger" (same spec doc, steps 1-6): associateId is always the caller's
    // own id, supplied by AssociateLedgerController from @AuthenticationPrincipal -- never null,
    // never taken from a request parameter (Decisions 3, 4). Reuses the same search() call and
    // cyclesById() batch-load helper as adminList() above; no associate lookup is needed since
    // every row belongs to the caller.
    public AssociateLedgerPageResponse myList(
            UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size) {
        Page<LedgerEntry> result = ledgerEntryRepository.search(
            associateId, incomeType, cycleId, status, PageRequest.of(page, size));

        List<LedgerEntry> content = result.getContent();
        Map<UUID, Cycle> cyclesById = cyclesById(content);

        Map<UUID, AssociateLedgerEntryResponse.LegBreakdown> breakdowns = legBreakdowns(associateId, content);

        Map<UUID, LedgerEntry> sponseeEntries = sponseeMatchingEntries(content);
        Map<UUID, Associate> sponsees = associatesById(List.copyOf(sponseeEntries.values()));

        List<AssociateLedgerEntryResponse> entries = content.stream()
            .map(e -> {
                LedgerEntry src = sponseeEntries.get(e.getSourceRef());
                Associate sponsee = src == null ? null : sponsees.get(src.getAssociateId());
                return toAssociateResponse(e, cyclesById.get(e.getCycleId()), breakdowns.get(e.getSourceRef()),
                    sponsee == null ? null : sponsee.getUserId(), src == null ? null : src.getGrossAmount());
            })
            .toList();
        return new AssociateLedgerPageResponse(entries, page, size, result.getTotalElements());
    }

    // SPONSOR_MATCHING rows' sourceRef is the sponsee's MATCHING ledger entry id (CycleService#creditSponsorMatching).
    // Keyed by that id; empty when the page has no SPONSOR_MATCHING rows.
    private Map<UUID, LedgerEntry> sponseeMatchingEntries(List<LedgerEntry> entries) {
        List<UUID> ids = entries.stream()
            .filter(e -> e.getIncomeType() == IncomeType.SPONSOR_MATCHING && e.getSourceRef() != null)
            .map(LedgerEntry::getSourceRef).distinct().toList();
        return ledgerEntryRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(LedgerEntry::getId, l -> l));
    }

    // Shared with (a follow-up unit's) GET /api/associates/me/ledger: every ledger row needs its
    // cycle's period dates resolved the same way regardless of who's asking.
    private Map<UUID, Cycle> cyclesById(List<LedgerEntry> entries) {
        List<UUID> distinctCycleIds = entries.stream().map(LedgerEntry::getCycleId).distinct().toList();
        return cycleRepository.findAllById(distinctCycleIds).stream()
            .collect(Collectors.toMap(Cycle::getId, c -> c));
    }

    private Map<UUID, Associate> associatesById(List<LedgerEntry> entries) {
        List<UUID> distinctAssociateIds = entries.stream().map(LedgerEntry::getAssociateId).distinct().toList();
        return associateRepository.findAllById(distinctAssociateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
    }

    // A missing associate or cycle lookup (should not happen under FK integrity) leaves the
    // corresponding fields null rather than failing the whole page -- this is a read-only audit
    // view, not a strict-consistency write path (Flow step 6).
    private AdminLedgerEntryResponse toAdminResponse(LedgerEntry entry, Associate associate, Cycle cycle) {
        return new AdminLedgerEntryResponse(
            entry.getId(),
            entry.getAssociateId(),
            associate == null ? null : associate.getUserId(),
            associate == null ? null : associate.getName(),
            entry.getIncomeType(),
            entry.getCycleId(),
            cycle == null ? null : cycle.getPeriodStart(),
            cycle == null ? null : cycle.getPeriodEnd(),
            entry.getGrossAmount(),
            entry.getTdsDeduction(),
            entry.getAdminDeduction(),
            entry.getNetAmount(),
            entry.getStatus(),
            entry.getSourceRef(),
            entry.getCreatedAt(),
            entry.getFulfilledAt(),
            entry.getFulfilmentRemark());
    }

    // Same "leave field null on a lookup miss" behavior as toAdminResponse above (Flow step 6)
    // -- a read-only view, not a strict-consistency write path.
    private AssociateLedgerEntryResponse toAssociateResponse(
            LedgerEntry entry, Cycle cycle, AssociateLedgerEntryResponse.LegBreakdown legBreakdown,
            String sponseeUserId, BigDecimal sponseeMatchingAmount) {
        return new AssociateLedgerEntryResponse(
            entry.getId(),
            entry.getIncomeType(),
            entry.getCycleId(),
            cycle == null ? null : cycle.getPeriodStart(),
            cycle == null ? null : cycle.getPeriodEnd(),
            entry.getGrossAmount(),
            entry.getTdsDeduction(),
            entry.getAdminDeduction(),
            entry.getNetAmount(),
            entry.getStatus(),
            entry.getSourceRef(),
            entry.getCreatedAt(),
            legBreakdown,
            sponseeUserId,
            sponseeMatchingAmount);
    }

    // MATCHING rows' sourceRef is the leg_volume.id (CycleService#creditMatchingIncome). Brought-forward
    // is the previous cycle's carriedForward on the caller's own history, same walk as
    // LegVolumeRepository#totalBusiness; total = leg volume (already includes the carry-in).
    // Keyed by leg_volume.id; empty when the page has no MATCHING rows.
    private Map<UUID, AssociateLedgerEntryResponse.LegBreakdown> legBreakdowns(
            UUID associateId, List<LedgerEntry> entries) {
        boolean anyMatching = entries.stream()
            .anyMatch(e -> e.getIncomeType() == IncomeType.MATCHING && e.getSourceRef() != null);
        Map<UUID, AssociateLedgerEntryResponse.LegBreakdown> result = new HashMap<>();
        if (!anyMatching) return result;

        BigDecimal bfLeft = BigDecimal.ZERO;
        BigDecimal bfRight = BigDecimal.ZERO;
        for (LegVolume row : legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId)) {
            BigDecimal totalLeft = row.getLeftLegVolume();
            BigDecimal totalRight = row.getRightLegVolume();
            BigDecimal matched = totalLeft.min(totalRight);
            result.put(row.getId(), new AssociateLedgerEntryResponse.LegBreakdown(
                bfLeft, bfRight, totalLeft.subtract(bfLeft), totalRight.subtract(bfRight),
                totalLeft, totalRight, matched, matched, matched));
            bfLeft = row.getCarriedForwardLeft();
            bfRight = row.getCarriedForwardRight();
        }
        return result;
    }

    // Full reward ladder for the caller, each tier joined to its REWARD ledger row (sourceRef =
    // reward_tier.id, CycleService#creditReward). Required left/right = volume still missing per
    // leg: max(0, threshold - cumulative leg business). No row = NOT_ACHIEVED.
    public List<AssociateRewardTierRow> myRewardTiers(UUID associateId) {
        Map<UUID, LedgerEntry> bySourceRef = rewardEntriesBySourceRef(associateId);
        LegVolumeRepository.LegBusinessTotals totals = legVolumeRepository.totalBusiness(associateId);
        return compensationPlanService.currentRewardTiers().stream().map(t -> {
            LedgerEntry e = bySourceRef.get(t.getId());
            return new AssociateRewardTierRow(
                t.getTierLevel(),
                t.getVolumeThreshold(),
                t.getDesignation(),
                remaining(t.getVolumeThreshold(), totals.left()),
                remaining(t.getVolumeThreshold(), totals.right()),
                t.getCashReward(),
                t.getPerkDescription(),
                e == null ? null : e.getStatus(),
                e == null ? null : e.getCreatedAt());
        }).toList();
    }

    // Achieved rewards in tier order, with admin fulfilment (pay status/date/remark).
    public List<AssociateRewardAchievedRow> myRewardsAchieved(UUID associateId) {
        Map<UUID, LedgerEntry> bySourceRef = rewardEntriesBySourceRef(associateId);
        return compensationPlanService.currentRewardTiers().stream()
            .filter(t -> bySourceRef.containsKey(t.getId()))
            .map(t -> {
                LedgerEntry e = bySourceRef.get(t.getId());
                return new AssociateRewardAchievedRow(
                    e.getCreatedAt(), t.getDesignation(), t.getCashReward(), t.getPerkDescription(),
                    e.getFulfilledAt() != null, e.getFulfilledAt(), e.getFulfilmentRemark());
            }).toList();
    }

    // Admin marks a reward handed over. Re-marking just updates date/remark.
    @Transactional
    public AdminLedgerEntryResponse fulfilReward(UUID ledgerEntryId, Instant fulfilledAt, String remark) {
        LedgerEntry entry = ledgerEntryRepository.findById(ledgerEntryId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ledger entry not found"));
        if (entry.getIncomeType() != IncomeType.REWARD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only REWARD entries can be marked paid");
        }
        entry.setFulfilledAt(fulfilledAt);
        entry.setFulfilmentRemark(remark);
        ledgerEntryRepository.save(entry);
        return toAdminResponse(
            entry,
            associateRepository.findById(entry.getAssociateId()).orElse(null),
            cycleRepository.findById(entry.getCycleId()).orElse(null));
    }

    private Map<UUID, LedgerEntry> rewardEntriesBySourceRef(UUID associateId) {
        Map<UUID, LedgerEntry> bySourceRef = new HashMap<>();
        for (LedgerEntry e : ledgerEntryRepository.findByAssociateIdAndIncomeType(associateId, IncomeType.REWARD)) {
            if (e.getSourceRef() != null) bySourceRef.put(e.getSourceRef(), e);
        }
        return bySourceRef;
    }

    private static BigDecimal remaining(BigDecimal threshold, BigDecimal achieved) {
        return threshold.subtract(achieved).max(BigDecimal.ZERO);
    }
}
