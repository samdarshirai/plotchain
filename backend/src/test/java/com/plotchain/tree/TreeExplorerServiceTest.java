package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TreeExplorerServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SaleRepository saleRepository;

    TreeExplorerService service;
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        service = new TreeExplorerService(associateRepository, rankTierRepository, cycleRepository, legVolumeRepository, saleRepository);
    }

    private Associate newAssociate(UUID id, String userId, Instant joinedAt) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Name " + userId);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(joinedAt);
        return a;
    }

    @Test
    void subtreeThrowsWhenRootNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.subtree(id)).isInstanceOf(AssociateNotFoundException.class);
    }

    private static final UUID FOUNDING_ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Test
    void companyTreeRootsAtTheFoundingAdminAndExpandsItsDownline() {
        UUID childId = UUID.randomUUID();
        Associate foundingAdmin = newAssociate(FOUNDING_ADMIN_ID, "admin", Instant.now());
        foundingAdmin.setRole(AssociateRole.ADMIN);
        foundingAdmin.setRankId(null);
        Associate child = newAssociate(childId, "VP00001", Instant.now());

        when(associateRepository.findById(FOUNDING_ADMIN_ID)).thenReturn(Optional.of(foundingAdmin));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(associateRepository.findByParentId(FOUNDING_ADMIN_ID)).thenReturn(List.of(child));

        TreeNodeResponse response = service.companyTree();

        assertThat(response.userId()).isEqualTo("admin");
        assertThat(response.rankName()).isNull();
        assertThat(response.children()).hasSize(1);
        assertThat(response.children().get(0).userId()).isEqualTo("VP00001");
    }

    @Test
    void companyTreeThrowsWhenTheFoundingAdminIsMissing() {
        when(associateRepository.findById(FOUNDING_ADMIN_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.companyTree()).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void subtreeBuildsEveryLevelWithNoDepthCap() {
        UUID rootId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());

        when(associateRepository.findByIdAndRole(rootId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(root));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        Associate previous = root;
        for (int i = 2; i <= 9; i++) {
            Associate next = newAssociate(UUID.randomUUID(), "VP0000" + i, Instant.now());
            when(associateRepository.findByParentId(previous.getId())).thenReturn(List.of(next));
            previous = next;
        }

        TreeNodeResponse node = service.subtree(rootId);
        for (int i = 2; i <= 9; i++) {
            assertThat(node.children()).hasSize(1);
            node = node.children().get(0);
            assertThat(node.userId()).isEqualTo("VP0000" + i);
        }
    }

    @Test
    void subtreeDoesNotFlagSkewedWhenBothLegsAreZero() {
        UUID id = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now());
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        LegVolume legVolume = LegVolume.empty(id, cycleId);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(legVolume));
        TreeNodeResponse response = service.subtree(id);

        // The skew rule only applies when BOTH legs are non-zero -- a brand-new node with no
        // sales on either leg must never be flagged, even though 0/0 is technically undefined.
        assertThat(response.skewedLegsFlag()).isFalse();
    }

    @Test
    void subtreeFlagsSkewedLegsWhenOneLegIsAtLeastTenTimesTheOther() {
        UUID id = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now());
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        LegVolume skewed = new LegVolume(UUID.randomUUID(), id, cycleId,
            new BigDecimal("100000"), new BigDecimal("1000000"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(skewed));
        TreeNodeResponse response = service.subtree(id);

        assertThat(response.skewedLegsFlag()).isTrue();
    }

    @Test
    void subtreeDoesNotFlagSkewedWhenLegsAreWithinTheRatioThreshold() {
        UUID id = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now());
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        // Just under the 10x threshold: 900000 / 100000 = 9, must not be flagged.
        LegVolume balanced = new LegVolume(UUID.randomUUID(), id, cycleId,
            new BigDecimal("100000"), new BigDecimal("900000"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(balanced));
        TreeNodeResponse response = service.subtree(id);

        assertThat(response.skewedLegsFlag()).isFalse();
    }

    @Test
    void subtreeFlagsStagnantWhenJoinedOverNinetyDaysAgoWithNoDirectDownline() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now().minus(91, ChronoUnit.DAYS));

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        TreeNodeResponse response = service.subtree(id);

        assertThat(response.stagnantFlag()).isTrue();
    }

    @Test
    void searchReturnsTheAncestorPathForAnExactUserIdMatch() {
        UUID rootId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());
        Associate target = newAssociate(targetId, "VP00002", Instant.now());
        target.setRole(AssociateRole.ASSOCIATE);

        when(associateRepository.findByUserId("VP00002")).thenReturn(Optional.of(target));
        when(associateRepository.findAncestorChain(targetId)).thenReturn(List.of(rootId, targetId));
        when(associateRepository.findAllById(List.of(rootId, targetId))).thenReturn(List.of(root, target));

        TreeSearchResponse response = service.search("VP00002");

        assertThat(response.ancestorPath()).extracting(TreeNodeSummary::userId)
            .containsExactly("VP00001", "VP00002");
    }

    @Test
    void searchThrowsWhenUserIdNotFound() {
        when(associateRepository.findByUserId("nobody")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.search("nobody")).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void nodeDetailsAggregatesLegCountsBusinessAndDirectChildIdsWithOneLegVacant() {
        UUID id = UUID.randomUUID();
        UUID leftChildId = UUID.randomUUID();
        Instant joinedAt = Instant.parse("2025-09-05T05:25:42Z");
        Associate associate = newAssociate(id, "VP00001", joinedAt);
        Associate leftChild = newAssociate(leftChildId, "VP00002", Instant.now());
        leftChild.setPosition("L");
        // No right child -- rightMemberId must come back null, not "" or throw.

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(associateRepository.findByParentId(id)).thenReturn(List.of(leftChild));
        when(associateRepository.countDownlineByPosition(id, "L")).thenReturn(4L);
        when(associateRepository.countDownlineByPosition(id, "R")).thenReturn(0L);
        when(associateRepository.countDownlineByPositionAndStatus(id, "L", AssociateStatus.ACTIVE.name())).thenReturn(3L);
        when(associateRepository.countDownlineByPositionAndStatus(id, "R", AssociateStatus.ACTIVE.name())).thenReturn(0L);
        when(legVolumeRepository.totalBusiness(id))
            .thenReturn(new LegVolumeRepository.LegBusinessTotals(new BigDecimal("50000"), new BigDecimal("0")));
        when(saleRepository.sumAmountByAssociateIdAndStatus(id, SaleStatus.RECORDED)).thenReturn(new BigDecimal("12000"));
        // live business from the still-open cycle is added on top of closed-cycle totals
        when(saleRepository.sumOpenCycleLegBusiness(id, "L")).thenReturn(new BigDecimal("7000"));
        when(saleRepository.sumOpenCycleLegBusiness(id, "R")).thenReturn(new BigDecimal("3000"));

        TreeNodeDetailsResponse response = service.nodeDetails(id);

        assertThat(response.name()).isEqualTo("Name VP00001");
        assertThat(response.userId()).isEqualTo("VP00001");
        assertThat(response.joinedAt()).isEqualTo(joinedAt);
        assertThat(response.leftMemberId()).isEqualTo("VP00002");
        assertThat(response.rightMemberId()).isNull();
        assertThat(response.totalLeftMembers()).isEqualTo(4L);
        assertThat(response.totalRightMembers()).isEqualTo(0L);
        assertThat(response.activeLeftMembers()).isEqualTo(3L);
        assertThat(response.activeRightMembers()).isEqualTo(0L);
        assertThat(response.totalLeftBusiness()).isEqualByComparingTo("57000");
        assertThat(response.totalRightBusiness()).isEqualByComparingTo("3000");
        assertThat(response.totalSelfBusiness()).isEqualByComparingTo("12000");
    }

    @Test
    void nodeDetailsThrowsWhenAssociateNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.nodeDetails(id)).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void nodeDetailsWorksForTheFoundingAdminRoot() {
        Associate foundingAdmin = newAssociate(FOUNDING_ADMIN_ID, "admin", Instant.now());
        foundingAdmin.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(FOUNDING_ADMIN_ID)).thenReturn(Optional.of(foundingAdmin));
        when(associateRepository.findByParentId(FOUNDING_ADMIN_ID)).thenReturn(List.of());
        when(legVolumeRepository.totalBusiness(FOUNDING_ADMIN_ID))
            .thenReturn(new LegVolumeRepository.LegBusinessTotals(BigDecimal.ZERO, BigDecimal.ZERO));
        when(saleRepository.sumAmountByAssociateIdAndStatus(FOUNDING_ADMIN_ID, SaleStatus.RECORDED)).thenReturn(BigDecimal.ZERO);
        when(saleRepository.sumOpenCycleLegBusiness(FOUNDING_ADMIN_ID, "L")).thenReturn(BigDecimal.ZERO);
        when(saleRepository.sumOpenCycleLegBusiness(FOUNDING_ADMIN_ID, "R")).thenReturn(BigDecimal.ZERO);

        assertThat(service.nodeDetails(FOUNDING_ADMIN_ID).userId()).isEqualTo("admin");
    }
}
