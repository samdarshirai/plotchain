package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
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
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
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
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
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
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        mockMvc.perform(get("/api/admin/associates").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        ArgumentCaptor<PageRequest> pageableCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(associateRepository).searchDirectory(any(), any(), any(), any(), any(), any(), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(100);
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/admin/associates").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        ArgumentCaptor<PageRequest> pageableCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(associateRepository).searchDirectory(any(), any(), any(), any(), any(), any(), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isEqualTo(0);
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
    void suspendIsForbiddenForAnAssociateToken() throws Exception {
        // 403 proves @PreAuthorize narrowing is still in force: ASSOCIATE is blocked twice over
        // (the blanket POST rule and this method's own @PreAuthorize), same reasoning the old
        // FINANCE-token test used to prove before FINANCE existed as a role.
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void resetPasswordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void tokenForANewlySuspendedAssociateIsRejectedOnTheVeryNextRequest() throws Exception {
        // Uses a freshly generated id rather than the shared ASSOCIATE_ID constant: the real
        // AssociateStatusCache is a singleton Spring bean shared across every test in this
        // class, so reusing a constant id risks a stale cached entry leaking in from another
        // test's execution order.
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setUserId("VP00099");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findById(id)).thenReturn(Optional.of(associate));
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        String associateToken = jwtService.generateToken(associate);

        mockMvc.perform(post("/api/admin/associates/" + id + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        // No role restriction on this endpoint in SecurityConfig -- any authenticated principal
        // can reach it, so a 401 here proves the auth layer (real AssociateStatusCache) rejected
        // the request, not a role-based 403 that would happen even if eviction were broken.
        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + associateToken))
            .andExpect(status().isUnauthorized());
    }
}
