package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.DesignationService;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TreeExplorerService {

    private static final int MAX_LEG_SKEW_RATIO = 10;
    private static final long STAGNANT_THRESHOLD_DAYS = 90;

    private final AssociateRepository associateRepository;
    private final DesignationService designationService;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final SaleRepository saleRepository;

    public TreeExplorerService(
        AssociateRepository associateRepository,
        DesignationService designationService,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository
    ) {
        this.associateRepository = associateRepository;
        this.designationService = designationService;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
    }

    public TreeNodeResponse subtree(UUID associateId) {
        Associate root = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return buildFrom(root);
    }

    // Admin Tree Explorer hover details (lazy, per-node -- see TreeNodeDetailsResponse for why
    // this isn't baked into the bulk tree response).
    public TreeNodeDetailsResponse nodeDetails(UUID associateId) {
        Associate a = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        List<Associate> directChildren = associateRepository.findByParentId(associateId);
        String leftMemberId = directChildren.stream()
            .filter(c -> "L".equals(c.getPosition())).findFirst().map(Associate::getUserId).orElse(null);
        String rightMemberId = directChildren.stream()
            .filter(c -> "R".equals(c.getPosition())).findFirst().map(Associate::getUserId).orElse(null);

        long totalLeftMembers = associateRepository.countDownlineByPosition(associateId, "L");
        long totalRightMembers = associateRepository.countDownlineByPosition(associateId, "R");
        long activeLeftMembers = associateRepository.countDownlineByPositionAndStatus(associateId, "L", AssociateStatus.ACTIVE.name());
        long activeRightMembers = associateRepository.countDownlineByPositionAndStatus(associateId, "R", AssociateStatus.ACTIVE.name());

        LegVolumeRepository.LegBusinessTotals business = legVolumeRepository.totalBusiness(associateId)
            .plus(saleRepository.sumOpenCycleLegBusiness(associateId, "L"),
                saleRepository.sumOpenCycleLegBusiness(associateId, "R"));
        BigDecimal totalSelfBusiness = saleRepository.sumAmountByAssociateIdAndStatus(associateId, SaleStatus.RECORDED);

        return new TreeNodeDetailsResponse(a.getName(), a.getUserId(), a.getJoinedAt(), leftMemberId, rightMemberId,
            totalLeftMembers, totalRightMembers, activeLeftMembers, activeRightMembers,
            business.left(), business.right(), totalSelfBusiness);
    }

    /**
     * The whole placement tree, rooted at the root user (the parentless ASSOCIATE created during
     * onboarding). Powers the admin Tree Explorer's default view -- no search term needed.
     * Unbounded depth. Null until the root user exists.
     */
    public TreeNodeResponse companyTree() {
        return associateRepository.findFirstByParentIdIsNullAndRole(AssociateRole.ASSOCIATE)
            .map(this::buildFrom)
            .orElse(null);
    }

    private TreeNodeResponse buildFrom(Associate root) {
        List<UUID> subtreeIds = associateRepository.findSelfAndDownline(root.getId());
        Map<UUID, String> designations = designationService.designationsOf(subtreeIds);
        Set<UUID> plotBuyers = new HashSet<>(associateRepository.findPlotBuyerIds(subtreeIds));
        // leg_volume rows are written only at cycle CLOSE (CycleService#rollUpSubtree), keyed to
        // the cycle being closed -- the currently OPEN cycle never has a row of its own, so this
        // lookup was a structural no-op that always fell through to zero (same bug already fixed
        // in DashboardService, see docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md).
        // Reading the last CLOSED cycle instead is "current standing as of the last close."
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        return buildNode(root, designations, plotBuyers, latestClosedCycle, businessTotals(subtreeIds));
    }

    private Map<UUID, LegVolumeRepository.LegBusinessTotals> businessTotals(List<UUID> ids) {
        Map<UUID, LegVolumeRepository.LegBusinessTotals> totals = new HashMap<>();
        if (ids.isEmpty()) {
            return totals;
        }
        legVolumeRepository.findByAssociateIdInOrderByCyclePeriodStartAsc(ids).stream()
            .collect(Collectors.groupingBy(LegVolume::getAssociateId))
            .forEach((id, history) -> totals.put(id, LegVolumeRepository.totalBusinessFromHistory(history)));
        for (SaleRepository.OpenCycleLegBusiness row : saleRepository.sumOpenCycleLegBusinessByAssociateIds(ids)) {
            totals.compute(row.getAssociateId(), (id, closed) -> {
                if (closed == null) {
                    closed = new LegVolumeRepository.LegBusinessTotals(BigDecimal.ZERO, BigDecimal.ZERO);
                }
                return closed.plus("L".equals(row.getPosition()) ? row.getAmount() : BigDecimal.ZERO,
                    "R".equals(row.getPosition()) ? row.getAmount() : BigDecimal.ZERO);
            });
        }
        return totals;
    }

    public TreeSearchResponse search(String userId) {
        Associate target = associateRepository.findByUserId(userId)
            .filter(a -> a.getRole() == AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(userId));

        List<UUID> chain = associateRepository.findAncestorChain(target.getId());
        Map<UUID, Associate> byId = associateRepository.findAllById(chain).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
        List<TreeNodeSummary> path = chain.stream()
            .map(byId::get)
            .map(a -> new TreeNodeSummary(a.getId(), a.getUserId(), a.getName()))
            .toList();
        return new TreeSearchResponse(path);
    }

    // /my-tree search bar (associate-scoped, not admin): matches by name or userId within the
    // caller's own findSelfAndDownline set only. Unlike search() above, this returns a
    // single-entry ancestorPath (just the match) rather than a full chain to the company root --
    // the only caller of this (AssociateTreeController.mySearch -> MyTreeComponent.onSearch)
    // reads just ancestorPath[last].id to re-root, and a full chain here would expose names of
    // associates above the caller, which the "downline only" scoping is meant to prevent.
    public TreeSearchResponse searchWithinDownline(UUID associateId, String query) {
        List<UUID> downlineIds = associateRepository.findSelfAndDownline(associateId);
        Associate target = associateRepository.findByIdInAndNameOrUserIdContaining(downlineIds, query).stream()
            .findFirst()
            .orElseThrow(() -> new AssociateNotFoundException(query));
        return new TreeSearchResponse(List.of(new TreeNodeSummary(target.getId(), target.getUserId(), target.getName())));
    }

    // /my-tree re-root (associate-scoped): same subtree() build as the admin route, gated by
    // membership in the caller's own downline. AssociateNotFoundException (404), not a 403 --
    // matches subtree()'s existing response for an unknown id, and avoids confirming to the
    // caller that a given id belongs to some *other* real associate outside their downline.
    public TreeNodeResponse subtreeWithinDownline(UUID associateId, UUID targetId) {
        if (!associateRepository.findSelfAndDownline(associateId).contains(targetId)) {
            throw new AssociateNotFoundException(targetId);
        }
        return subtree(targetId);
    }

    // /my-tree hover details (associate-scoped counterpart of nodeDetails() above): same
    // downline-membership guard as subtreeWithinDownline().
    public TreeNodeDetailsResponse nodeDetailsWithinDownline(UUID associateId, UUID targetId) {
        if (!associateRepository.findSelfAndDownline(associateId).contains(targetId)) {
            throw new AssociateNotFoundException(targetId);
        }
        return nodeDetails(targetId);
    }

    private TreeNodeResponse buildNode(Associate a, Map<UUID, String> designations, Set<UUID> plotBuyers,
                                        Optional<Cycle> latestClosedCycle, Map<UUID, LegVolumeRepository.LegBusinessTotals> totals) {
        BigDecimal[] legs = legVolumesFor(a.getId(), latestClosedCycle);
        // ponytail: 2 queries per node (children + leg volume); batch-load the subtree via
        // the recursive CTE if trees reach thousands of nodes.
        List<TreeNodeResponse> children = associateRepository.findByParentId(a.getId()).stream()
            .map(child -> buildNode(child, designations, plotBuyers, latestClosedCycle, totals))
            .toList();
        long directDownlineCount = children.size();
        LegVolumeRepository.LegBusinessTotals business = totals.getOrDefault(a.getId(),
            new LegVolumeRepository.LegBusinessTotals(BigDecimal.ZERO, BigDecimal.ZERO));
        return new TreeNodeResponse(
            a.getId(), a.getUserId(), a.getName(), designations.get(a.getId()),
            a.getKycStatus(), a.getPosition(), legs[0], legs[1], business.left(), business.right(),
            isSkewed(legs[0], legs[1]), isStagnant(a, directDownlineCount), plotBuyers.contains(a.getId()), children);
    }

    private boolean isSkewed(BigDecimal left, BigDecimal right) {
        if (left.signum() == 0 || right.signum() == 0) {
            return false;
        }
        BigDecimal larger = left.max(right);
        BigDecimal smaller = left.min(right);
        return larger.compareTo(smaller.multiply(BigDecimal.valueOf(MAX_LEG_SKEW_RATIO))) >= 0;
    }

    private boolean isStagnant(Associate a, long directDownlineCount) {
        boolean oldEnough = a.getJoinedAt().isBefore(Instant.now().minus(STAGNANT_THRESHOLD_DAYS, ChronoUnit.DAYS));
        return oldEnough && directDownlineCount == 0;
    }

    private BigDecimal[] legVolumesFor(UUID associateId, Optional<Cycle> latestClosedCycle) {
        if (latestClosedCycle.isEmpty()) {
            return new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO};
        }
        return legVolumeRepository.findByAssociateIdAndCycleId(associateId, latestClosedCycle.get().getId())
            .map(lv -> new BigDecimal[]{lv.getLeftLegVolume(), lv.getRightLegVolume()})
            .orElse(new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
    }
}
