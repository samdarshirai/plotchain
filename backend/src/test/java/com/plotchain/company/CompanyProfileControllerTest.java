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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE so this runs a real CompanyProfileService inside a
// real Spring Security filter chain, per SetupStateControllerTest's pattern. CompanyProfileService
// now depends on the real SettingsAuditService bean, so its own repository dependencies
// (SettingsAuditLogRepository, AssociateRepository) need mocking too -- per
// SettingsAuditControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CompanyProfileControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean CompanyProfileRepository companyProfileRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private static final String VALID_PROFILE_JSON = """
        {
          "displayName": "Plotchain Estates",
          "legalName": "Plotchain Estates Private Limited",
          "registrationNumber": "",
          "contactName": "Jane Doe",
          "contactPhone": "+919876543210",
          "contactEmail": "jane@plotchain.test",
          "registeredAddress": "123 MG Road, Bengaluru"
        }
        """;

    @Test
    void getProfileReturnsTheStoredProfileForAnAdminToken() throws Exception {
        CompanyProfile stored = new CompanyProfile();
        stored.setDisplayName("Plotchain Estates");
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Plotchain Estates"));
    }

    @Test
    void getProfileIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putProfileSavesAndReturnsTheUpdatedProfile() throws Exception {
        CompanyProfile stored = new CompanyProfile();
        when(companyProfileRepository.findAll()).thenReturn(List.of(stored));
        when(companyProfileRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(VALID_PROFILE_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Plotchain Estates"))
            .andExpect(jsonPath("$.registeredAddress").value("123 MG Road, Bengaluru"));
    }

    @Test
    void putProfileReturnsFieldErrorsForBlankRequiredFields() throws Exception {
        when(companyProfileRepository.findAll()).thenReturn(List.of(new CompanyProfile()));

        mockMvc.perform(put("/api/company/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"displayName\":\"\",\"legalName\":\"\",\"contactName\":\"\","
                    + "\"contactPhone\":\"\",\"contactEmail\":\"not-an-email\",\"registeredAddress\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation failed"))
            .andExpect(jsonPath("$.fields.displayName").isNotEmpty())
            .andExpect(jsonPath("$.fields.contactEmail").isNotEmpty());
    }
}
