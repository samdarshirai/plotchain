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

// @MockBean on the repository INTERFACE so this runs a real BookingEmiConfigService inside a
// real Spring Security filter chain, per CompanyBrandingControllerTest's pattern.
// BookingEmiConfigService depends on the real SettingsAuditService bean, so its own repository
// dependencies (SettingsAuditLogRepository, AssociateRepository) need mocking too -- per
// CompanyProfileControllerTest's / WithdrawalConfigControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingEmiConfigControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean BookingEmiConfigRepository bookingEmiConfigRepository;
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
        BookingEmiConfig stored = new BookingEmiConfig();
        stored.setConfirmRule("MANUAL");
        when(bookingEmiConfigRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/booking-emi")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.confirmRule").value("MANUAL"));
    }

    @Test
    void getConfigIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/booking-emi")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedConfig() throws Exception {
        BookingEmiConfig stored = new BookingEmiConfig();
        when(bookingEmiConfigRepository.findAll()).thenReturn(List.of(stored));
        when(bookingEmiConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/booking-emi")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"emiEnabled\":true,\"defaultInstallmentCount\":12,\"confirmRule\":\"AUTO_THRESHOLD\",\"confirmThresholdPercent\":25}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.confirmRule").value("AUTO_THRESHOLD"));
    }

    @Test
    void putConfigReturns409ForAutoThresholdWithNoThreshold() throws Exception {
        when(bookingEmiConfigRepository.findAll()).thenReturn(List.of(new BookingEmiConfig()));

        mockMvc.perform(put("/api/company/booking-emi")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"emiEnabled\":true,\"defaultInstallmentCount\":1,\"confirmRule\":\"AUTO_THRESHOLD\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }
}
