package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
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

    TreeExplorerService service;
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        service = new TreeExplorerService(associateRepository, rankTierRepository, cycleRepository, legVolumeRepository);
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

        assertThatThrownBy(() -> service.subtree(id, 3)).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void subtreeBuildsNestedChildrenUpToDepth() {
        UUID rootId = UUID.randomUUID();
        UUID childId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());
        Associate child = newAssociate(childId, "VP00002", Instant.now());

        when(associateRepository.findByIdAndRole(rootId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(root));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(associateRepository.findByParentId(rootId)).thenReturn(List.of(child));
        // No findByParentId(childId) stub: depth 1 stops recursion at the child (remainingDepth
        // reaches 0 there), so buildNode never queries the child's own children.
        // No countByParentId(rootId) stub: root's remainingDepth (1) is > 0, so its
        // direct-downline count is derived from the already-fetched children list, not a
        // separate count query. Only the child (at the depth boundary) needs countByParentId.
        when(associateRepository.countByParentId(childId)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(rootId, 1);

        assertThat(response.userId()).isEqualTo("VP00001");
        assertThat(response.children()).hasSize(1);
        assertThat(response.children().get(0).userId()).isEqualTo("VP00002");
        assertThat(response.children().get(0).children()).isEmpty();
        // The root's direct-downline count for isStagnant must come from the already-fetched
        // children list, not a redundant countByParentId query.
        org.mockito.Mockito.verify(associateRepository, org.mockito.Mockito.never()).countByParentId(rootId);
    }

    @Test
    void subtreeDoesNotDescendPastTheRequestedDepth() {
        UUID rootId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());

        when(associateRepository.findByIdAndRole(rootId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(root));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(rootId)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(rootId, 0);

        assertThat(response.children()).isEmpty();
        // depth 0 means no expansion at all -- findByParentId must never be called.
        org.mockito.Mockito.verify(associateRepository, org.mockito.Mockito.never()).findByParentId(rootId);
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
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

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
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

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
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

        assertThat(response.skewedLegsFlag()).isFalse();
    }

    @Test
    void subtreeFlagsStagnantWhenJoinedOverNinetyDaysAgoWithNoDirectDownline() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now().minus(91, ChronoUnit.DAYS));

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

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
}
