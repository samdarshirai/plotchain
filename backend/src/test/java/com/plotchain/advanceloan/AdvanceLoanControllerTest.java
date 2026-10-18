package com.plotchain.advanceloan;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.AuthService;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdvanceLoanControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AuthService authService;
    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AdvanceLoanService service;

    private String tokenFor(AssociateRole role) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setRole(role);
        when(associateRepository.findById(a.getId())).thenReturn(Optional.of(a));
        return jwtService.generateToken(a);
    }

    @Test
    void duesForbiddenForAssociate() throws Exception {
        mockMvc.perform(get("/api/admin/advance-loans/dues").param("associateId", UUID.randomUUID().toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void duesOkForAdmin() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.dues(id)).thenReturn(new LoanDuesResponse(id, BigDecimal.TEN));
        mockMvc.perform(get("/api/admin/advance-loans/dues").param("associateId", id.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.outstanding").value(10));
    }

    @Test
    void repaymentRegisterForbiddenForAssociate() throws Exception {
        mockMvc.perform(get("/api/admin/loan-repayments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void repayRejectsNegativeAmountWith400() throws Exception {
        mockMvc.perform(post("/api/admin/advance-loans/" + UUID.randomUUID() + "/repayments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"paymentDate\":\"2026-10-02\",\"amount\":-1,\"payMode\":\"CASH\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void repayRejectsZeroAmountWith400() throws Exception {
        mockMvc.perform(post("/api/admin/advance-loans/" + UUID.randomUUID() + "/repayments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"paymentDate\":\"2026-10-02\",\"amount\":0,\"payMode\":\"CASH\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createRejectsZeroAmountWith400() throws Exception {
        mockMvc.perform(post("/api/admin/advance-loans")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"loanDate\":\"2026-10-01\",\"amount\":0,\"payMode\":\"CASH\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void receiptForbiddenForAssociate() throws Exception {
        mockMvc.perform(get("/api/admin/loan-repayments/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void repayRejectsThirteenDigitAmountWith400() throws Exception {
        mockMvc.perform(post("/api/admin/advance-loans/" + UUID.randomUUID() + "/repayments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"paymentDate\":\"2026-10-02\",\"amount\":1000000000000,\"payMode\":\"CASH\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createRejectsThirteenDigitAmountWith400() throws Exception {
        mockMvc.perform(post("/api/admin/advance-loans")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"loanDate\":\"2026-10-01\",\"amount\":1000000000000,\"payMode\":\"CASH\"}"))
            .andExpect(status().isBadRequest());
    }
}
