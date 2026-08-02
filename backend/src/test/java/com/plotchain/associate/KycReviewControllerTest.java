package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
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
class KycReviewControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

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
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void listDefaultsToPendingAndAllowsAnyAdminFamilyToken() throws Exception {
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            eq(AssociateRole.ASSOCIATE), eq(KycStatus.PENDING), any()))
            .thenReturn(new PageImpl<>(List.of(seedAssociate()), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/admin/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].userId").value("VP00001"));
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(eq(AssociateRole.ASSOCIATE), eq(KycStatus.PENDING), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        mockMvc.perform(get("/api/admin/kyc").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isOk());

        ArgumentCaptor<PageRequest> pageableCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(associateRepository).findByRoleAndKycStatusOrderByJoinedAtAsc(
            eq(AssociateRole.ASSOCIATE), eq(KycStatus.PENDING), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(100);
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(eq(AssociateRole.ASSOCIATE), eq(KycStatus.PENDING), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/admin/kyc").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isOk());

        ArgumentCaptor<PageRequest> pageableCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(associateRepository).findByRoleAndKycStatusOrderByJoinedAtAsc(
            eq(AssociateRole.ASSOCIATE), eq(KycStatus.PENDING), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isEqualTo(0);
    }

    @Test
    void decideSucceedsForAKycReviewerToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));

        mockMvc.perform(post("/api/admin/kyc/" + ASSOCIATE_ID + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.KYC_REVIEWER))
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new KycDecisionRequest(KycStatus.VERIFIED, null))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kycStatus").value("VERIFIED"));
    }

    @Test
    void decideIsForbiddenForAFinanceToken() throws Exception {
        // 403 proves @PreAuthorize narrowing: FINANCE passes the blanket admin-family POST
        // rule at the web layer but is not in KycReviewController's allowed-authority list.
        mockMvc.perform(post("/api/admin/kyc/" + ASSOCIATE_ID + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE))
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new KycDecisionRequest(KycStatus.VERIFIED, null))))
            .andExpect(status().isForbidden());
    }

    @Test
    void countsReturnsCountsForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING)).thenReturn(3L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)).thenReturn(2L);

        mockMvc.perform(get("/api/admin/kyc/counts")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pending").value(3))
            .andExpect(jsonPath("$.verified").value(10))
            .andExpect(jsonPath("$.rejected").value(2));
    }
}
