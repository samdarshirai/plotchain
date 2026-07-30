package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.api.ApiExceptionHandler;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.CompanyBrandingRepository;
import com.plotchain.company.CompanyBrandingService;
import com.plotchain.company.CompanyProfileRepository;
import com.plotchain.company.CompanyProfileService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.company.SetupState;
import com.plotchain.company.SetupStateRepository;
import com.plotchain.company.SetupStateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Deliberately NOT @SpringBootTest/@MockBean: this JDK's Mockito/ByteBuddy combination
// cannot mock concrete classes. Wiring a real AuthService against a mocked (interface)
// AssociateRepository sidesteps that entirely while still exercising the real HTTP/JSON/
// exception-mapping path via standalone MockMvc. SetupStateService is likewise a real
// instance over a mocked (interface) SetupStateRepository, for the same reason.
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock AssociateRepository associateRepository;
    @Mock SetupStateRepository setupStateRepository;
    @Mock CompanyProfileRepository companyProfileRepository;
    @Mock CompanyBrandingRepository companyBrandingRepository;
    // SettingsAuditService is a concrete class -- mocked (interface) repository underneath,
    // same reasoning as CompanyProfileService/CompanyBrandingService above.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    MockMvc mockMvc;
    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @BeforeEach
    void setUp() {
        JwtService jwtService = new JwtService("test-secret-key-at-least-32-bytes-long-for-hs256", 60);
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        SetupStateService setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            // Never invoked here: these tests only exercise isLaunched(), which doesn't touch
            // compensationPlanService/paymentConfigService/payoutBankAccountService/
            // projectService/adminProvisioningService/rootAssociateProvisioningService.
            null, null, null, null, null, null);
        AuthService authService = new AuthService(associateRepository, passwordEncoder, jwtService, setupStateService);
        mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(authService))
            .setControllerAdvice(new AuthExceptionHandler(), new ApiExceptionHandler())
            .build();
    }

    private void stubLaunched(boolean launched) {
        SetupState state = new SetupState();
        if (launched) {
            state.setLaunchedAt(Instant.now());
        }
        when(setupStateRepository.findAll()).thenReturn(List.of(state));
    }

    @Test
    void returnsATokenForValidCredentials() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched(true);

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new LoginRequest("jane", "Password123!"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty())
            .andExpect(jsonPath("$.role").value("ASSOCIATE"));
    }

    @Test
    void returns401ForWrongPassword() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new LoginRequest("jane", "wrong"))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns400ForMissingPassword() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content("{\"userId\":\"jane\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty())
            .andExpect(jsonPath("$.fields.password").isNotEmpty());
    }

    @Test
    void returns403ForAnAssociateLoginWhilePlatformIsNotLive() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched(false);

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new LoginRequest("jane", "Password123!"))))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }
}
