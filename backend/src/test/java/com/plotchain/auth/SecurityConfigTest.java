package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Covers SecurityConfig's authorization rules through the REAL Spring Security filter chain.
//
// AuthControllerTest deliberately uses MockMvcBuilders.standaloneSetup, which bypasses the
// filter chain entirely — good for exercising controller/JSON/exception-mapping, but it means
// nothing there can catch a SecurityConfig misconfiguration. Two rules in particular are
// ordering-sensitive and would fail only at runtime:
//
//   1. POST /api/auth/login must stay public. It is itself a POST to /api/**, so if the
//      blanket ADMIN write rule were ever declared above the login permitAll(), Spring
//      Security (first-match-wins) would gate login behind an ADMIN token — nobody could log
//      in, and every other test would still pass.
//   2. Writes are ADMIN-only by default, so a future endpoint author who forgets @PreAuthorize
//      still gets a safe posture rather than one open to every authenticated associate.
//
// @MockBean is on the AssociateRepository INTERFACE (interfaces mock fine on this JDK; the
// concrete-class Mockito/ByteBuddy issue documented elsewhere does not apply).
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityConfigTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired PasswordEncoder passwordEncoder;

    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        return jwtService.generateToken(associate);
    }

    @Test
    void loginIsReachableWithoutAToken() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new LoginRequest("jane@plotchain.test", "Password123!"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void writeRequestsAreRejectedForAnAssociateToken() throws Exception {
        // 403, not 404: the request is blocked at the security layer before handler mapping,
        // which is what proves the ADMIN-only write rule is actually in force.
        mockMvc.perform(post("/api/associates/some-future-write-endpoint")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void writeRequestsPassTheSecurityLayerForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        // 404 rather than 403: no such handler exists, but the request got past authorization,
        // which is the distinction being asserted. If this ever returns 403 for one of these
        // roles, the write rule has stopped matching that role's authority (e.g. a stray
        // ROLE_ prefix, or the hasAnyAuthority list falling out of sync with isAdminFamily()).
        mockMvc.perform(post("/api/associates/some-future-write-endpoint")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void passwordChangeIsReachableByAnAssociateToken() throws Exception {
        // A POST under /api/** that an ASSOCIATE must be able to reach. It needs its own
        // matcher ABOVE the blanket ADMIN write rules; without it this returns 403 and no
        // associate could ever clear their must-change-password state.
        //
        // We assert "not 403" rather than a specific success/failure status: with an
        // unstubbed repository and a deliberately short newPassword, the request can land on
        // a 400 (bean validation) or a 404 (associate not found) depending on which check
        // runs first downstream — both prove the request passed the security layer. Only a
        // 403 here would mean the matcher ordering regressed.
        mockMvc.perform(post("/api/associates/me/password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"currentPassword\":\"x\",\"newPassword\":\"y\"}"))
            .andExpect(status().is(not(403)));
    }
}
