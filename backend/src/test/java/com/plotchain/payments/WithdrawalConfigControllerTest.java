package com.plotchain.payments;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE so this runs a real WithdrawalConfigService inside a
// real Spring Security filter chain, per CompanyBrandingControllerTest's pattern.
// WithdrawalConfigService now depends on the real SettingsAuditService bean, so its own
// repository dependencies (SettingsAuditLogRepository, AssociateRepository) need mocking too --
// per CompanyProfileControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WithdrawalConfigControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean WithdrawalConfigRepository withdrawalConfigRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getConfigReturnsTheStoredConfigForAnAdminToken() throws Exception {
        WithdrawalConfig stored = new WithdrawalConfig();
        stored.setApprovalMode("ALWAYS_MANUAL");
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.approvalMode").value("ALWAYS_MANUAL"));
    }

    @Test
    void getConfigIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedConfig() throws Exception {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));
        when(withdrawalConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"approvalMode\":\"AUTO_UNDER_LIMIT\",\"autoApproveLimit\":25000.00}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.approvalMode").value("AUTO_UNDER_LIMIT"));
    }

    @Test
    void putConfigReturns409ForAutoUnderLimitWithNoLimit() throws Exception {
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(new WithdrawalConfig()));

        mockMvc.perform(put("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"approvalMode\":\"AUTO_UNDER_LIMIT\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }
}
