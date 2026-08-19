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
}
