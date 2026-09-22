package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TreeExplorerService {

    private static final int MAX_LEG_SKEW_RATIO = 10;
    private static final long STAGNANT_THRESHOLD_DAYS = 90;

    // The founding admin seeded by V18__seed_founding_admin.sql: parent_id IS NULL, so it is
    // the root of the binary placement tree by construction. Role is ADMIN (not ASSOCIATE),
    // which is why companyTree() cannot go through subtree()'s findByIdAndRole guard.
    private static final UUID FOUNDING_ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final SaleRepository saleRepository;

    public TreeExplorerService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
    }

    public TreeNodeResponse subtree(UUID associateId, int depth) {
        Associate root = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return buildFrom(root, depth);
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

        LegVolumeRepository.LegBusinessTotals business = legVolumeRepository.totalBusiness(associateId);
        BigDecimal totalSelfBusiness = saleRepository.sumAmountByAssociateIdAndStatus(associateId, SaleStatus.RECORDED);

        return new TreeNodeDetailsResponse(a.getName(), a.getUserId(), a.getJoinedAt(), leftMemberId, rightMemberId,
            totalLeftMembers, totalRightMembers, activeLeftMembers, activeRightMembers,
            business.left(), business.right(), totalSelfBusiness);
    }

    /**
     * The whole placement tree, rooted at the founding admin (V18). Powers the admin Tree
     * Explorer's default view -- no search term needed. Bounded, like subtree(), only by the
     * caller's depth clamp.
     */
    public TreeNodeResponse companyTree(int depth) {
        Associate root = associateRepository.findById(FOUNDING_ADMIN_ID)
            .orElseThrow(() -> new AssociateNotFoundException(FOUNDING_ADMIN_ID));
        return buildFrom(root, depth);
    }

    private TreeNodeResponse buildFrom(Associate root, int depth) {
        Map<UUID, RankTier> ranksById = rankTierRepository.findAllByOrderByRankOrder().stream()
            .collect(Collectors.toMap(RankTier::getId, r -> r));
        // leg_volume rows are written only at cycle CLOSE (CycleService#rollUpSubtree), keyed to
        // the cycle being closed -- the currently OPEN cycle never has a row of its own, so this
        // lookup was a structural no-op that always fell through to zero (same bug already fixed
        // in DashboardService, see docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md).
        // Reading the last CLOSED cycle instead is "current standing as of the last close."
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        return buildNode(root, depth, ranksById, latestClosedCycle);
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
    public TreeNodeResponse subtreeWithinDownline(UUID associateId, UUID targetId, int depth) {
        if (!associateRepository.findSelfAndDownline(associateId).contains(targetId)) {
            throw new AssociateNotFoundException(targetId);
        }
        return subtree(targetId, depth);
    }

    // /my-tree hover details (associate-scoped counterpart of nodeDetails() above): same
    // downline-membership guard as subtreeWithinDownline().
    public TreeNodeDetailsResponse nodeDetailsWithinDownline(UUID associateId, UUID targetId) {
        if (!associateRepository.findSelfAndDownline(associateId).contains(targetId)) {
            throw new AssociateNotFoundException(targetId);
        }
        return nodeDetails(targetId);
    }

    private TreeNodeResponse buildNode(Associate a, int remainingDepth, Map<UUID, RankTier> ranksById,
                                        Optional<Cycle> latestClosedCycle) {
        BigDecimal[] legs = legVolumesFor(a.getId(), latestClosedCycle);
        List<TreeNodeResponse> children = remainingDepth <= 0
            ? List.of()
            : associateRepository.findByParentId(a.getId()).stream()
                .map(child -> buildNode(child, remainingDepth - 1, ranksById, latestClosedCycle))
                .toList();
        // When remainingDepth > 0 the children were just fetched above via findByParentId, so
        // children.size() is already the direct-downline count -- no need to re-ask the
        // database. Only at the depth boundary (remainingDepth <= 0, children never fetched)
        // do we fall back to a real count query, since an empty `children` there doesn't tell
        // us whether the associate actually has zero children or recursion simply stopped.
        long directDownlineCount = remainingDepth > 0
            ? children.size()
            : associateRepository.countByParentId(a.getId());
        RankTier rank = ranksById.get(a.getRankId());
        return new TreeNodeResponse(
            a.getId(), a.getUserId(), a.getName(), rank == null ? null : rank.getName(),
            a.getKycStatus(), a.getPosition(), legs[0], legs[1],
            isSkewed(legs[0], legs[1]), isStagnant(a, directDownlineCount), children);
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
