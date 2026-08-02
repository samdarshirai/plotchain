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
