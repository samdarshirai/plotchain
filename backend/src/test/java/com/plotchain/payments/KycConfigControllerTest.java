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
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE so this runs a real KycConfigService inside a real
// Spring Security filter chain, per CompanyBrandingControllerTest's pattern. KycConfigService
// now depends on the real SettingsAuditService bean, so its own repository dependencies
// (SettingsAuditLogRepository, AssociateRepository) need mocking too -- per
// CompanyProfileControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KycConfigControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean KycConfigRepository kycConfigRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private KycConfig storedConfig() {
        KycConfig config = new KycConfig();
        config.setStrictness("STRICT");
        config.setRequiredDocuments("AADHAAR,PAN,BANK_PASSBOOK");
        return config;
    }

    @Test
    void getConfigReturnsTheStoredConfigForAnAdminToken() throws Exception {
        when(kycConfigRepository.findAll()).thenReturn(List.of(storedConfig()));

        mockMvc.perform(get("/api/company/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.strictness").value("STRICT"))
            .andExpect(jsonPath("$.requiredDocuments.length()").value(3));
    }

    @Test
    void getConfigIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedConfig() throws Exception {
        KycConfig stored = storedConfig();
        when(kycConfigRepository.findAll()).thenReturn(List.of(stored));
        when(kycConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"strictness\":\"RELAXED\",\"requiredDocuments\":[\"AADHAAR\",\"PAN\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.strictness").value("RELAXED"));
    }

    @Test
    void putConfigRejectsAnOffValueForStrictness() throws Exception {
        when(kycConfigRepository.findAll()).thenReturn(List.of(storedConfig()));

        mockMvc.perform(put("/api/company/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"strictness\":\"OFF\",\"requiredDocuments\":[\"AADHAAR\"]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation failed"))
            .andExpect(jsonPath("$.fields.strictness").isNotEmpty());
    }

    @Test
    void putConfigRejectsAnEmptyDocumentList() throws Exception {
        when(kycConfigRepository.findAll()).thenReturn(List.of(storedConfig()));

        mockMvc.perform(put("/api/company/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"strictness\":\"STRICT\",\"requiredDocuments\":[]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.requiredDocuments").isNotEmpty());
    }
}
