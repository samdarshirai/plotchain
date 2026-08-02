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

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TreeExplorerControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;

    private static final UUID ROOT_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Associate seedRoot() {
        Associate a = new Associate();
        a.setId(ROOT_ID);
        a.setUserId("VP00001");
        a.setName("Root");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void subtreeReturnsTheRootNodeForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.findByIdAndRole(ROOT_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedRoot()));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(ROOT_ID)).thenReturn(0L);

        mockMvc.perform(get("/api/admin/tree/" + ROOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"));
    }

    @Test
    void subtreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum() throws Exception {
        // This JDK's Mockito/ByteBuddy combination cannot mock/spy the concrete
        // TreeExplorerService (see AuthControllerTest for the same constraint elsewhere in this
        // suite), so clamping is verified behaviorally through the mocked (interface)
        // AssociateRepository instead: build a chain 6 associates deep and prove that a
        // depth=999 request only recurses 5 levels (the clamp), not all the way down.
        Associate root = seedRoot();
        List<Associate> chain = new java.util.ArrayList<>();
        Associate previous = root;
        for (int i = 1; i <= 6; i++) {
            Associate a = new Associate();
            a.setId(UUID.randomUUID());
            a.setUserId("VP0000" + i);
            a.setName("Level " + i);
            a.setRole(AssociateRole.ASSOCIATE);
            a.setKycStatus(KycStatus.PENDING);
            a.setJoinedAt(Instant.now());
            chain.add(a);
            when(associateRepository.findByParentId(previous.getId())).thenReturn(List.of(a));
            when(associateRepository.countByParentId(previous.getId())).thenReturn(1L);
            previous = a;
        }

        when(associateRepository.findByIdAndRole(ROOT_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(root));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/admin/tree/" + ROOT_ID).param("depth", "999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk());

        // depth=999 must be silently clamped to the server-side maximum of 5: buildNode expands
        // root (level 0) through level 4 (5 expansions total), then stops at the level-5 node
        // without ever fetching level 5's own children -- otherwise a low-privilege admin-family
        // token could trigger a 2^(depth+1)-1 node recursive fetch and exhaust server memory/time.
        verify(associateRepository, never()).findByParentId(chain.get(4).getId());
    }

    @Test
    void subtreeIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/tree/" + ROOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void searchReturnsTheAncestorPath() throws Exception {
        Associate root = seedRoot();
        when(associateRepository.findByUserId("VP00001")).thenReturn(Optional.of(root));
        when(associateRepository.findAncestorChain(ROOT_ID)).thenReturn(List.of(ROOT_ID));
        when(associateRepository.findAllById(List.of(ROOT_ID))).thenReturn(List.of(root));

        mockMvc.perform(get("/api/admin/tree/search").param("q", "VP00001")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ancestorPath[0].userId").value("VP00001"));
    }
}
