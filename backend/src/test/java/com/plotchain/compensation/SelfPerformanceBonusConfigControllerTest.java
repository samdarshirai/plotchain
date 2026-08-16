package com.plotchain.compensation;

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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SelfPerformanceBonusConfigControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getConfigReturnsTheStoredEnabledFlagForAnAdminToken() throws Exception {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        stored.setEnabled(true);
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/self-performance-bonus")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true));
    }

    @Test
    void getConfigIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/self-performance-bonus")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedFlag() throws Exception {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));
        when(selfPerformanceBonusConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/self-performance-bonus")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"enabled\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true));
    }
}
