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

// @MockBean on the repository INTERFACE so this runs a real PaymentConfigService (and a real
// SecretsEncryptionService, autowired from the test context) inside a real Spring Security
// filter chain, per CompanyBrandingControllerTest's pattern. PaymentConfigService now depends
// on the real SettingsAuditService bean, so its own repository dependencies
// (SettingsAuditLogRepository, AssociateRepository) need mocking too -- per
// CompanyProfileControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PaymentConfigControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean PaymentConfigRepository paymentConfigRepository;
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
    void getConfigNeverReturnsRawCredentials() throws Exception {
        PaymentConfig stored = new PaymentConfig();
        stored.setGateway("RAZORPAY");
        stored.setCredentialsEncrypted("ciphertext-value");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/payments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.gateway").value("RAZORPAY"))
            .andExpect(jsonPath("$.credentialsConfigured").value(true))
            .andExpect(jsonPath("$.credentials").doesNotExist())
            .andExpect(jsonPath("$.credentialsEncrypted").doesNotExist());
    }

    @Test
    void getConfigIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/payments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedConfig() throws Exception {
        PaymentConfig stored = new PaymentConfig();
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));
        when(paymentConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/payments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"gateway\":\"RAZORPAY\",\"credentials\":\"sk_live_x\",\"modesEnabled\":[\"CARDS\",\"UPI\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.gateway").value("RAZORPAY"))
            .andExpect(jsonPath("$.credentialsConfigured").value(true));
    }

    @Test
    void putConfigReturnsFieldErrorForBlankGateway() throws Exception {
        when(paymentConfigRepository.findAll()).thenReturn(List.of(new PaymentConfig()));

        mockMvc.perform(put("/api/company/payments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"gateway\":\"\",\"modesEnabled\":[]}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation failed"))
            .andExpect(jsonPath("$.fields.gateway").isNotEmpty());
    }
}
