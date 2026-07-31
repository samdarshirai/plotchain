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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE so this runs a real AdminProvisioningService inside a
// real Spring Security filter chain, per CompanyProfileControllerTest's pattern.
// InvalidAdminRoleException (400) and UserIdAlreadyRegisteredException (409) are already wired
// into CompanyExceptionHandler -- this class only asserts the resulting status codes, not the
// handler wiring itself. AdminProvisioningService now depends on the real SettingsAuditService
// bean, so its own repository dependency (SettingsAuditLogRepository) needs mocking too -- per
// CompanyProfileControllerTest's pattern -- otherwise the real H2 DB rejects the audit insert
// since the JWT actor id was never persisted as a real associate row.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    @Test
    void createReturnsCreatedWithAOneTimePassword() throws Exception {
        when(associateRepository.existsByUserId("finance1")).thenReturn(false);

        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"userId\":\"finance1\",\"fullName\":\"Jane Finance\",\"role\":\"FINANCE\","
                    + "\"temporaryPassword\":\"Sup3rSecret!\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.userId").value("finance1"))
            .andExpect(jsonPath("$.role").value("FINANCE"))
            .andExpect(jsonPath("$.temporaryPassword").value("Sup3rSecret!"));
    }

    @Test
    void createReturnsBadRequestForBlankRequiredFields() throws Exception {
        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"userId\":\"\",\"fullName\":\"\",\"role\":\"\",\"temporaryPassword\":\"\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturnsBadRequestForAnAssociateRole() throws Exception {
        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"userId\":\"user1\",\"fullName\":\"Someone\",\"role\":\"ASSOCIATE\","
                    + "\"temporaryPassword\":\"pw\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void createReturnsConflictForADuplicateUserId() throws Exception {
        when(associateRepository.existsByUserId("taken")).thenReturn(true);

        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"userId\":\"taken\",\"fullName\":\"Someone\",\"role\":\"SUPPORT\","
                    + "\"temporaryPassword\":\"pw\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void listReturnsAdminFamilySummaries() throws Exception {
        Associate finance = new Associate();
        finance.setId(UUID.randomUUID());
        finance.setUserId("finance1");
        finance.setName("Jane Finance");
        finance.setRole(AssociateRole.FINANCE);
        finance.setLastActiveAt(Instant.now());
        when(associateRepository.findByRoleNotOrderByUserIdAsc(AssociateRole.ASSOCIATE)).thenReturn(List.of(finance));

        mockMvc.perform(get("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].userId").value("finance1"))
            .andExpect(jsonPath("$[0].role").value("FINANCE"));
    }

    @Test
    void userIdAvailabilityIsTrueWhenNotTaken() throws Exception {
        when(associateRepository.existsByUserId("fresh")).thenReturn(false);

        mockMvc.perform(get("/api/company/admins/user-id-available").param("userId", "fresh")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void userIdAvailabilityIsFalseWhenTaken() throws Exception {
        when(associateRepository.existsByUserId("taken")).thenReturn(true);

        mockMvc.perform(get("/api/company/admins/user-id-available").param("userId", "taken")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.available").value(false));
    }

    @Test
    void rolePermissionsReturnsTheStaticPermissionMap() throws Exception {
        mockMvc.perform(get("/api/company/admins/role-permissions")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.SUPER_ADMIN").isArray())
            .andExpect(jsonPath("$.FINANCE").isArray())
            .andExpect(jsonPath("$.KYC_REVIEWER").isArray())
            .andExpect(jsonPath("$.SUPPORT").isArray());
    }
}
