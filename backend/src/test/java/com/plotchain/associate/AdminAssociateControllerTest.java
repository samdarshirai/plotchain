package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminAssociateControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Associate seedAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setJoinedAt(Instant.now());
        a.setPasswordHash("hash");
        return a;
    }

    @Test
    void listReturnsAPageForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(seedAssociate()), PageRequest.of(0, 20), 1));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));

        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.associates[0].userId").value("VP00001"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void suspendSucceedsForAnAdminToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUSPENDED"));
    }

    @Test
    void suspendIsForbiddenForAFinanceToken() throws Exception {
        // 403 here proves the @PreAuthorize narrowing beyond the blanket admin-family POST rule:
        // FINANCE passes SecurityConfig's web-layer check but must be rejected by method security.
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void resetPasswordIsForbiddenForAKycReviewerToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.KYC_REVIEWER)))
            .andExpect(status().isForbidden());
    }
}
