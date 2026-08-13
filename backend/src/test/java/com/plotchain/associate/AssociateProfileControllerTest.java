package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE (not AssociateProfileService), so this runs a real
// AssociateProfileService inside a real Spring Security filter chain -- same pattern as
// KycSubmissionControllerTest.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateProfileControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;

    private Associate seeded(UUID id) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setPhone("9990001111");
        a.setEmail("jane@example.com");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setJoinedAt(Instant.now());
        return a;
    }

    private String tokenFor(Associate associate) {
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getReturnsTheCallersOwnProfile() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(get("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"))
            .andExpect(jsonPath("$.name").value("Jane Doe"))
            .andExpect(jsonPath("$.email").value("jane@example.com"));
    }

    @Test
    void getReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/profile"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void putUpdatesNamePhoneAndEmail() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateRepository.existsByEmail("jane.a.doe@example.com")).thenReturn(false);
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane A. Doe", "9990002222", "jane.a.doe@example.com"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Jane A. Doe"))
            .andExpect(jsonPath("$.phone").value("9990002222"))
            .andExpect(jsonPath("$.email").value("jane.a.doe@example.com"));
    }

    @Test
    void putRejectsABlankName() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("  ", "9990002222", "jane@example.com"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void putReturnsConflictWhenEmailAlreadyRegisteredToAnotherAssociate() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateRepository.existsByEmail("taken@example.com")).thenReturn(true);

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "taken@example.com"))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void putReturns401WithoutAToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/profile")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "jane@example.com"))))
            .andExpect(status().isUnauthorized());
    }
}
