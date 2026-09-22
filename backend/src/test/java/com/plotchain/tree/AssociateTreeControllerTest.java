package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateTreeControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;

    // Stubs the JwtAuthenticationFilter's per-request associate lookup (same reason
    // TreeExplorerControllerTest's tokenFor() does this) so the minted token authenticates.
    private String tokenForAssociate(Associate associate) {
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Associate newSelf(UUID id, String userId) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Self");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void myTreeReturnsTheCallersOwnSubtreeScopedByTheJwtPrincipal() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00042");

        // There is no path or query parameter carrying an associate ID on this route at all --
        // the only way the service is ever asked about `selfId` is because that's who the
        // token belongs to. If this route accidentally let a caller specify a different ID, no
        // stub in this test would satisfy it and the response would come back empty/error.
        when(associateRepository.findByIdAndRole(selfId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(self));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(selfId)).thenReturn(0L);

        mockMvc.perform(get("/api/associates/me/tree")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00042"));
    }

    @Test
    void myTreeReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/tree"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void myTreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum() throws Exception {
        // Mirrors TreeExplorerControllerTest.subtreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum,
        // adapted to the self-scoped route: same JDK/Mockito constraint prevents spying the
        // concrete TreeExplorerService, so the clamp is verified behaviorally through the
        // mocked AssociateRepository -- build a chain 6 deep, prove depth=999 only recurses 5
        // levels, not all the way down.
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");

        List<Associate> chain = new java.util.ArrayList<>();
        Associate previous = self;
        for (int i = 1; i <= 6; i++) {
            Associate a = newSelf(UUID.randomUUID(), "VP0000" + i);
            chain.add(a);
            when(associateRepository.findByParentId(previous.getId())).thenReturn(List.of(a));
            when(associateRepository.countByParentId(previous.getId())).thenReturn(1L);
            previous = a;
        }

        when(associateRepository.findByIdAndRole(selfId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(self));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/tree").param("depth", "999")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk());

        verify(associateRepository, never()).findByParentId(chain.get(4).getId());
    }

    @Test
    void mySearchReturnsAMatchFromTheCallersOwnDownline() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");
        UUID downlineMemberId = UUID.randomUUID();
        Associate downlineMember = newSelf(downlineMemberId, "VP00002");
        downlineMember.setName("Downline Person");

        when(associateRepository.findSelfAndDownline(selfId))
            .thenReturn(List.of(selfId, downlineMemberId));
        when(associateRepository.findByIdInAndNameOrUserIdContaining(List.of(selfId, downlineMemberId), "Downline"))
            .thenReturn(List.of(downlineMember));

        mockMvc.perform(get("/api/associates/me/tree/search").param("q", "Downline")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ancestorPath[0].userId").value("VP00002"));
    }

    @Test
    void mySearchReturns404ForAnAssociateOutsideTheCallersDownline() throws Exception {
        // No stub for findByIdInAndNameOrUserIdContaining with any id list containing the
        // outsider -- the query is scoped to findSelfAndDownline, so an associate elsewhere
        // in the company can never be matched, regardless of how the mock would otherwise
        // behave for an unscoped search.
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");

        when(associateRepository.findSelfAndDownline(selfId)).thenReturn(List.of(selfId));
        when(associateRepository.findByIdInAndNameOrUserIdContaining(List.of(selfId), "Outsider"))
            .thenReturn(List.of());

        mockMvc.perform(get("/api/associates/me/tree/search").param("q", "Outsider")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isNotFound());
    }

    @Test
    void mySubtreeReRootsAtADownlineAssociate() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");
        UUID downlineMemberId = UUID.randomUUID();
        Associate downlineMember = newSelf(downlineMemberId, "VP00002");

        when(associateRepository.findSelfAndDownline(selfId))
            .thenReturn(List.of(selfId, downlineMemberId));
        when(associateRepository.findByIdAndRole(downlineMemberId, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(downlineMember));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(downlineMemberId)).thenReturn(0L);

        mockMvc.perform(get("/api/associates/me/tree/" + downlineMemberId)
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00002"));
    }

    @Test
    void mySubtreeReturns404ForAnAssociateOutsideTheCallersDownlineEvenIfTheyReallyExist() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");
        UUID outsiderId = UUID.randomUUID();

        when(associateRepository.findSelfAndDownline(selfId)).thenReturn(List.of(selfId));
        // Deliberately no stub for findByIdAndRole(outsiderId, ...) -- the downline-membership
        // check must short-circuit before that lookup ever runs, proving the 404 comes from the
        // scoping guard and not merely from an unmocked repository call.

        mockMvc.perform(get("/api/associates/me/tree/" + outsiderId)
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isNotFound());

        verify(associateRepository, never()).findByIdAndRole(outsiderId, AssociateRole.ASSOCIATE);
    }

    @Test
    void myNodeDetailsReturnsHoverDetailsForADownlineAssociate() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");
        UUID downlineMemberId = UUID.randomUUID();
        Associate downlineMember = newSelf(downlineMemberId, "VP00002");

        when(associateRepository.findSelfAndDownline(selfId))
            .thenReturn(List.of(selfId, downlineMemberId));
        when(associateRepository.findByIdAndRole(downlineMemberId, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(downlineMember));
        when(associateRepository.findByParentId(downlineMemberId)).thenReturn(List.of());
        when(associateRepository.countDownlineByPosition(downlineMemberId, "L")).thenReturn(0L);
        when(associateRepository.countDownlineByPosition(downlineMemberId, "R")).thenReturn(0L);
        when(associateRepository.countDownlineByPositionAndStatus(eq(downlineMemberId), eq("L"), any())).thenReturn(0L);
        when(associateRepository.countDownlineByPositionAndStatus(eq(downlineMemberId), eq("R"), any())).thenReturn(0L);
        when(legVolumeRepository.totalBusiness(downlineMemberId))
            .thenReturn(new LegVolumeRepository.LegBusinessTotals(BigDecimal.ZERO, BigDecimal.ZERO));

        mockMvc.perform(get("/api/associates/me/tree/" + downlineMemberId + "/details")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00002"));
    }

    @Test
    void myNodeDetailsReturns404ForAnAssociateOutsideTheCallersDownline() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");
        UUID outsiderId = UUID.randomUUID();

        when(associateRepository.findSelfAndDownline(selfId)).thenReturn(List.of(selfId));

        mockMvc.perform(get("/api/associates/me/tree/" + outsiderId + "/details")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isNotFound());

        verify(associateRepository, never()).findByIdAndRole(outsiderId, AssociateRole.ASSOCIATE);
    }
}
