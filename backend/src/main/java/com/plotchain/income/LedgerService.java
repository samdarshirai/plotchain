package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanService;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRule;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.sales.SaleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
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
    private final SaleRepository saleRepository;

    public LedgerService(
            LedgerEntryRepository ledgerEntryRepository,
            AssociateRepository associateRepository,
            CycleRepository cycleRepository,
            LegVolumeRepository legVolumeRepository,
            CompensationPlanService compensationPlanService,
            SaleRepository saleRepository) {
        this.compensationPlanService = compensationPlanService;
        this.saleRepository = saleRepository;
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

        // Leg breakdown is per-associate history; one lookup per distinct associate on the page
        // (ponytail: <=100 rows/page, so bounded; batch query if pages grow).
        Map<UUID, AssociateLedgerEntryResponse.LegBreakdown> breakdowns = new HashMap<>();
        content.stream().collect(Collectors.groupingBy(LedgerEntry::getAssociateId))
            .forEach((aid, rows) -> breakdowns.putAll(legBreakdowns(aid, rows)));

        Map<UUID, LedgerEntry> sponseeEntries = sponseeMatchingEntries(content);
        Map<UUID, Associate> sponsees = associatesById(List.copyOf(sponseeEntries.values()));

        List<AdminLedgerEntryResponse> entries = content.stream()
            .map(e -> {
                LedgerEntry src = sponseeEntries.get(e.getSourceRef());
                Associate sponsee = src == null ? null : sponsees.get(src.getAssociateId());
                return toAdminResponse(e, associatesById.get(e.getAssociateId()), cyclesById.get(e.getCycleId()),
                    breakdowns.get(e.getSourceRef()),
                    sponsee == null ? null : sponsee.getUserId(), src == null ? null : src.getGrossAmount());
            })
            .toList();
        return new AdminLedgerPageResponse(entries, page, size, result.getTotalElements());
    }

    // Admin Summary tab: one row per associate x cycle, net per income type. Newest cycle first,
    // then associate id; paged in memory (see LedgerEntryRepository#summarise).
    public AdminLedgerSummaryPageResponse adminSummary(UUID associateId, UUID cycleId, int page, int size) {
        List<AdminLedgerSummaryRow> rows = toSummaryRows(ledgerEntryRepository.summarise(associateId, cycleId));
        int from = Math.min(page * size, rows.size());
        int to = Math.min(from + size, rows.size());
        return new AdminLedgerSummaryPageResponse(rows.subList(from, to), page, size, rows.size());
    }

    // Associate "My Downline Income Report": every associate below the caller (whole tree, self
    // excluded), one row per associate x cycle, DIRECT + MATCHING only. Newest cycle first.
    public List<AdminLedgerSummaryRow> myDownlineSummary(UUID associateId) {
        List<UUID> ids = associateRepository.findSelfAndDownline(associateId).stream()
            .filter(id -> !id.equals(associateId)).toList();
        return ids.isEmpty() ? List.of() : toSummaryRows(ledgerEntryRepository.summariseDownline(ids));
    }

    private List<AdminLedgerSummaryRow> toSummaryRows(List<LedgerSummaryRow> all) {
        Map<UUID, Associate> associates = associateRepository
            .findAllById(all.stream().map(LedgerSummaryRow::getAssociateId).distinct().toList()).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
        Map<UUID, Cycle> cycles = cycleRepository
            .findAllById(all.stream().map(LedgerSummaryRow::getCycleId).distinct().toList()).stream()
            .collect(Collectors.toMap(Cycle::getId, c -> c));

        return all.stream().map(r -> {
            Associate a = associates.get(r.getAssociateId());
            Cycle c = cycles.get(r.getCycleId());
            Map<IncomeType, BigDecimal> gross = new java.util.EnumMap<>(IncomeType.class);
            gross.put(IncomeType.DIRECT, r.getDirect());
            gross.put(IncomeType.MATCHING, r.getMatching());
            gross.put(IncomeType.SPONSOR_MATCHING, r.getSponsorMatching());
            gross.put(IncomeType.ROYALTY, r.getRoyalty());
            gross.put(IncomeType.REWARD, r.getReward());
            return new AdminLedgerSummaryRow(
                r.getAssociateId(), a == null ? null : a.getUserId(), a == null ? null : a.getName(),
                r.getCycleId(), c == null ? null : c.getPeriodStart(), c == null ? null : c.getPeriodEnd(),
                gross, r.getTotalGross(), r.getTds(), r.getAdminCharges(), r.getTotalNet(),
                r.getEntryCount(), r.getPaidCount(), r.getPaidAt());
        }).sorted(java.util.Comparator
            .comparing(AdminLedgerSummaryRow::cyclePeriodStart, java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder()))
            .thenComparing(AdminLedgerSummaryRow::associateUserId, java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())))
            .toList();
    }

    // Associate Income Statement "All" tab: the caller's own per-cycle summary, every cycle,
    // newest first. Same rows as the admin Summary tab, scoped to one associate.
    public List<AdminLedgerSummaryRow> mySummary(UUID associateId) {
        return adminSummary(associateId, null, 0, Integer.MAX_VALUE).rows();
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

        Map<UUID, com.plotchain.sales.Sale> directSales = directSales(content);
        List<UUID> sellerIds = directSales.values().stream().map(com.plotchain.sales.Sale::getAssociateId).distinct().toList();
        Map<UUID, Associate> directSellers = sellerIds.isEmpty() ? new HashMap<>()
            : associateRepository.findAllById(sellerIds).stream().collect(Collectors.toMap(Associate::getId, a -> a));

        List<AssociateLedgerEntryResponse> entries = content.stream()
            .map(e -> {
                LedgerEntry src = sponseeEntries.get(e.getSourceRef());
                Associate sponsee = src == null ? null : sponsees.get(src.getAssociateId());
                com.plotchain.sales.Sale sale = directSales.get(e.getSourceRef());
                Associate seller = sale == null ? null : directSellers.get(sale.getAssociateId());
                return toAssociateResponse(e, cyclesById.get(e.getCycleId()), breakdowns.get(e.getSourceRef()),
                    sponsee != null ? sponsee.getUserId() : seller == null ? null : seller.getUserId(),
                    src == null ? null : src.getGrossAmount(),
                    seller == null ? null : seller.getName(),
                    sale == null ? null : sale.getAmount());
            })
            .toList();
        BigDecimal totalGross = ledgerEntryRepository.sumGrossAmount(associateId, incomeType, cycleId, status);
        return new AssociateLedgerPageResponse(entries, page, size, result.getTotalElements(), totalGross);
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

    // DIRECT rows' sourceRef is the sale id (SaleService#persistSaleAndIncome). Keyed by that id;
    // one batch query, empty when the page has no DIRECT rows.
    private Map<UUID, com.plotchain.sales.Sale> directSales(List<LedgerEntry> entries) {
        List<UUID> ids = entries.stream()
            .filter(e -> e.getIncomeType() == IncomeType.DIRECT && e.getSourceRef() != null)
            .map(LedgerEntry::getSourceRef).distinct().toList();
        if (ids.isEmpty()) {
            return new HashMap<>();
        }
        return saleRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(com.plotchain.sales.Sale::getId, sl -> sl));
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
        if (distinctAssociateIds.isEmpty()) {
            return new HashMap<>();
        }
        return associateRepository.findAllById(distinctAssociateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
    }

    // A missing associate or cycle lookup (should not happen under FK integrity) leaves the
    // corresponding fields null rather than failing the whole page -- this is a read-only audit
    // view, not a strict-consistency write path (Flow step 6).
    private AdminLedgerEntryResponse toAdminResponse(LedgerEntry entry, Associate associate, Cycle cycle) {
        return toAdminResponse(entry, associate, cycle, null, null, null);
    }

    private AdminLedgerEntryResponse toAdminResponse(
            LedgerEntry entry, Associate associate, Cycle cycle,
            AssociateLedgerEntryResponse.LegBreakdown legBreakdown,
            String sponseeUserId, BigDecimal sponseeMatchingAmount) {
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
            entry.getFulfilmentRemark(),
            legBreakdown,
            sponseeUserId,
            sponseeMatchingAmount);
    }

    // Same "leave field null on a lookup miss" behavior as toAdminResponse above (Flow step 6)
    // -- a read-only view, not a strict-consistency write path.
    private AssociateLedgerEntryResponse toAssociateResponse(
            LedgerEntry entry, Cycle cycle, AssociateLedgerEntryResponse.LegBreakdown legBreakdown,
            String sponseeUserId, BigDecimal sponseeMatchingAmount, String sponseeName, BigDecimal saleAmount) {
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
            sponseeMatchingAmount,
            sponseeName,
            saleAmount);
    }

    // MATCHING and ROYALTY rows' sourceRef is the leg_volume.id (CycleService#creditMatchingIncome/creditRoyalty). Brought-forward
    // is the previous cycle's carriedForward on the caller's own history, same walk as
    // LegVolumeRepository#totalBusiness; total = leg volume (already includes the carry-in).
    // Keyed by leg_volume.id; empty when the page has no MATCHING rows.
    private Map<UUID, AssociateLedgerEntryResponse.LegBreakdown> legBreakdowns(
            UUID associateId, List<LedgerEntry> entries) {
        boolean anyMatching = entries.stream()
            .anyMatch(e -> (e.getIncomeType() == IncomeType.MATCHING || e.getIncomeType() == IncomeType.ROYALTY)
                && e.getSourceRef() != null);
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

        // Live open-cycle rows (CycleService.refreshLiveIncome) point at a leg volume that is never
        // persisted, so they miss above. Rebuild theirs the way DashboardService does: carry-in from
        // the latest closed row (bfLeft/bfRight as left by the loop) plus this cycle's leg sales.
        List<UUID> liveRefs = entries.stream()
            .filter(e -> (e.getIncomeType() == IncomeType.MATCHING || e.getIncomeType() == IncomeType.ROYALTY)
                && e.getSourceRef() != null && !result.containsKey(e.getSourceRef()))
            .map(LedgerEntry::getSourceRef).toList();
        if (!liveRefs.isEmpty()) {
            BigDecimal newLeft = saleRepository.sumOpenCycleLegBusiness(associateId, "L");
            BigDecimal newRight = saleRepository.sumOpenCycleLegBusiness(associateId, "R");
            BigDecimal totalLeft = bfLeft.add(newLeft);
            BigDecimal totalRight = bfRight.add(newRight);
            BigDecimal matched = totalLeft.min(totalRight);
            AssociateLedgerEntryResponse.LegBreakdown live = new AssociateLedgerEntryResponse.LegBreakdown(
                bfLeft, bfRight, newLeft, newRight, totalLeft, totalRight, matched, matched, matched);
            liveRefs.forEach(ref -> result.put(ref, live));
        }
        return result;
    }

    // Full reward ladder for the caller, each tier joined to its REWARD ledger row (sourceRef =
    // reward_tier.id, CycleService#creditReward). Leg volume resets after each level, so each
    // level is measured on volume earned AFTER the previous levels (matched = min(left, right)
    // against the running sum of thresholds). Required left/right = volume still missing per leg:
    // 0 for a cleared level, max(0, thresholdsThroughThis - leg business) for the level in
    // progress, and the full threshold for every level after it. Live: closed-cycle totals plus
    // this OPEN cycle's leg sales, same as DashboardService's Total Left/Right Business.
    // No row = NOT_ACHIEVED.
    public List<AssociateRewardTierRow> myRewardTiers(UUID associateId) {
        Map<Integer, LedgerEntry> byLevel = rewardEntriesByTierLevel(associateId);
        LegVolumeRepository.LegBusinessTotals closed = legVolumeRepository.totalBusiness(associateId);
        BigDecimal openLeft = saleRepository.sumOpenCycleLegBusiness(associateId, "L");
        BigDecimal openRight = saleRepository.sumOpenCycleLegBusiness(associateId, "R");
        BigDecimal left = closed.left().add(openLeft);
        BigDecimal right = closed.right().add(openRight);
        BigDecimal matched = RewardTierRule.lifetimeMatched(closed, openLeft, openRight);
        List<AssociateRewardTierRow> rows = new ArrayList<>();
        List<RewardTier> tiers = compensationPlanService.currentRewardTiers();
        List<BigDecimal> reachedAt = RewardTierRule.cumulativeThresholds(tiers);
        BigDecimal before = BigDecimal.ZERO;
        for (int i = 0; i < tiers.size(); i++) {
            RewardTier t = tiers.get(i);
            BigDecimal through = reachedAt.get(i);
            BigDecimal requiredLeft;
            BigDecimal requiredRight;
            if (matched.compareTo(through) >= 0) {
                requiredLeft = BigDecimal.ZERO;
                requiredRight = BigDecimal.ZERO;
            } else if (matched.compareTo(before) >= 0) {
                requiredLeft = remaining(through, left);
                requiredRight = remaining(through, right);
            } else {
                requiredLeft = t.getVolumeThreshold();
                requiredRight = t.getVolumeThreshold();
            }
            LedgerEntry e = byLevel.get(t.getTierLevel());
            rows.add(new AssociateRewardTierRow(
                t.getTierLevel(),
                t.getVolumeThreshold(),
                t.getDesignation(),
                requiredLeft,
                requiredRight,
                t.getCashReward(),
                t.getPerkDescription(),
                e == null ? null : e.getStatus(),
                e == null ? null : e.getCreatedAt()));
            before = through;
        }
        return rows;
    }

    public AssociateRewardBusiness myRewardBusiness(UUID associateId) {
        LegVolumeRepository.LegBusinessTotals closed = legVolumeRepository.totalBusiness(associateId);
        BigDecimal newLeft = saleRepository.sumOpenCycleLegBusiness(associateId, "L");
        BigDecimal newRight = saleRepository.sumOpenCycleLegBusiness(associateId, "R");
        return new AssociateRewardBusiness(
            closed.left().add(newLeft), closed.right().add(newRight),
            closed.left(), closed.right(),
            newLeft, newRight);
    }

    // Achieved rewards in tier order, with admin fulfilment (pay status/date/remark).
    public List<AssociateRewardAchievedRow> myRewardsAchieved(UUID associateId) {
        Map<Integer, LedgerEntry> byLevel = rewardEntriesByTierLevel(associateId);
        return compensationPlanService.currentRewardTiers().stream()
            .filter(t -> byLevel.containsKey(t.getTierLevel()))
            .map(t -> {
                LedgerEntry e = byLevel.get(t.getTierLevel());
                return new AssociateRewardAchievedRow(
                    e.getCreatedAt(), t.getDesignation(), t.getCashReward(), t.getPerkDescription(),
                    e.getFulfilledAt() != null, e.getFulfilledAt(), e.getFulfilmentRemark());
            }).toList();
    }

    // Admin records the payment date/remark for any ledger row. Re-marking just updates date/remark.
    @Transactional
    public AdminLedgerEntryResponse fulfilReward(UUID ledgerEntryId, Instant fulfilledAt, String remark) {
        LedgerEntry entry = ledgerEntryRepository.findById(ledgerEntryId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ledger entry not found"));
        entry.setFulfilledAt(fulfilledAt);
        entry.setFulfilmentRemark(remark);
        ledgerEntryRepository.save(entry);
        return toAdminResponse(
            entry,
            associateRepository.findById(entry.getAssociateId()).orElse(null),
            cycleRepository.findById(entry.getCycleId()).orElse(null));
    }

    // Bulk: all-or-nothing. Payment date only; status/wallet untouched.
    @Transactional
    public void markPaid(List<UUID> ids, Instant paidAt, String remark) {
        List<UUID> distinct = ids.stream().distinct().toList();
        List<LedgerEntry> entries = ledgerEntryRepository.findAllById(distinct);
        if (entries.size() != distinct.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ledger entry not found");
        }
        entries.forEach(e -> {
            e.setFulfilledAt(paidAt);
            e.setFulfilmentRemark(remark);
        });
        ledgerEntryRepository.saveAll(entries);
    }

    // Pays every still-unpaid entry of each associate x cycle (all income types). Already-paid
    // entries keep their original date/remark. All-or-nothing: a pair with no entries is a 404.
    @Transactional
    public void markSummaryPaid(List<MarkSummaryPaidRequest.Row> rows, Instant paidAt, String remark) {
        for (MarkSummaryPaidRequest.Row row : rows.stream().distinct().toList()) {
            List<LedgerEntry> entries = ledgerEntryRepository.findByAssociateIdAndCycleId(row.associateId(), row.cycleId());
            if (entries.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ledger entry not found");
            }
            entries.stream().filter(e -> e.getFulfilledAt() == null).forEach(e -> {
                e.setFulfilledAt(paidAt);
                e.setFulfilmentRemark(remark);
            });
            ledgerEntryRepository.saveAll(entries);
        }
    }

    // The associate's REWARD rows by tier LEVEL (ledger_entry.tier_level), not tier id: every plan
    // save makes new reward_tier ids, so a level awarded under an earlier plan version must still
    // count as achieved. If a level has several rows (legacy duplicates), the earliest is the
    // original award.
    private Map<Integer, LedgerEntry> rewardEntriesByTierLevel(UUID associateId) {
        Map<Integer, LedgerEntry> byLevel = new HashMap<>();
        for (LedgerEntry e : ledgerEntryRepository.findByAssociateIdAndIncomeType(associateId, IncomeType.REWARD)) {
            if (e.getTierLevel() != null) {
                byLevel.merge(e.getTierLevel(), e, (a, b) -> b.getCreatedAt().isBefore(a.getCreatedAt()) ? b : a);
            }
        }
        return byLevel;
    }

    private static BigDecimal remaining(BigDecimal threshold, BigDecimal achieved) {
        return threshold.subtract(achieved).max(BigDecimal.ZERO);
    }
}
