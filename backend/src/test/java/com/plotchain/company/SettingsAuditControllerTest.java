package com.plotchain.company;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
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
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES (not SettingsAuditService) so this runs a real
// SettingsAuditService inside a real Spring Security filter chain, per
// CompanyProfileControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SettingsAuditControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    @Test
    void listReturnsThePageResponseFromTheService() throws Exception {
        SettingsAuditLog entry = new SettingsAuditLog(
            UUID.randomUUID(), UUID.randomUUID(), "profile", "Updated display name",
            "{\"displayName\":\"Plotchain Estates\"}", Instant.now());
        when(settingsAuditLogRepository.findAllByOrderByChangedAtDesc(any()))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/company/audit-log")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].section").value("profile"))
            .andExpect(jsonPath("$.entries[0].summary").value("Updated display name"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listPassesSectionQueryParamThrough() throws Exception {
        when(settingsAuditLogRepository.findAllBySectionOrderByChangedAtDesc(eq("branding"), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/company/audit-log")
                .param("section", "branding")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(settingsAuditLogRepository).findAllBySectionOrderByChangedAtDesc(eq("branding"), any());
    }

    @Test
    void listDefaultsPageAndSizeWhenOmitted() throws Exception {
        when(settingsAuditLogRepository.findAllByOrderByChangedAtDesc(PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/company/audit-log")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20));

        verify(settingsAuditLogRepository).findAllByOrderByChangedAtDesc(PageRequest.of(0, 20));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/audit-log")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
}
