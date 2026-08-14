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

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE so this runs a real SetupStateService inside a real
// Spring Security filter chain, per DashboardControllerTest's pattern.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SetupStateControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SetupStateRepository setupStateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void returnsAllStepsIncompleteForAnAdminToken() throws Exception {
        when(setupStateRepository.findAll()).thenReturn(List.of(new SetupState()));

        mockMvc.perform(get("/api/company/setup-state")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.steps.length()").value(6))
            .andExpect(jsonPath("$.canGoLive").value(false))
            .andExpect(jsonPath("$.launchedAt").doesNotExist());
    }

    @Test
    void isForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/setup-state")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void launchIsBlockedWhileRequiredStepsAreIncomplete() throws Exception {
        when(setupStateRepository.findAll()).thenReturn(List.of(new SetupState()));

        mockMvc.perform(post("/api/company/launch")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"acceptTerms\":true}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.incompleteSteps").isArray());
    }

    @Test
    void launchIsRejectedWhenTermsAreNotAccepted() throws Exception {
        mockMvc.perform(post("/api/company/launch")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"acceptTerms\":false}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.acceptTerms").isNotEmpty());
    }
}
