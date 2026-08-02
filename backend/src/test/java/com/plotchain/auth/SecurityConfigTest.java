package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SetupState;
import com.plotchain.company.SetupStateRepository;
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

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
    @MockBean SetupStateRepository setupStateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        return jwtService.generateToken(associate);
    }

    // Not related to setup gating -- this test proves permitAll() matcher ordering. Stubbed
    // launched so an ASSOCIATE login here isn't also exercising PlatformNotLiveException;
    // that gate has its own dedicated tests in AuthServiceTest/AuthControllerTest.
    private void stubLaunched() {
        SetupState state = new SetupState();
        state.setLaunchedAt(Instant.now());
        when(setupStateRepository.findAll()).thenReturn(List.of(state));
    }

    @Test
    void loginIsReachableWithoutAToken() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched();

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new LoginRequest("jane", "Password123!"))))
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
    void setupStateIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/setup-state")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void setupStateIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        when(setupStateRepository.findAll()).thenReturn(List.of(new SetupState()));

        mockMvc.perform(get("/api/company/setup-state")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void brandingIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/branding")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void compensationIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void compensationHistoryIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/compensation/history")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // No @MockBean for the compensation repositories in this class -- they run for real against
    // the H2 test DB, which Flyway seeds with a genesis compensation plan row (see the V8
    // migration and CompensationPlanControllerTest). That's what makes isOk() the right
    // assertion here rather than the "not 403" used elsewhere in this file for unstubbed paths.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void compensationIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/compensation")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void paymentsIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/payments")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void payoutAccountIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/payout-account")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void kycIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void withdrawalIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // No @MockBean for the payments repositories in this class -- they run for real against the
    // H2 test DB, which V9 seeds with a genesis row for each of the four tables (same reasoning
    // as compensationIsReachableForAnyAdminFamilyToken above).
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void paymentsIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/payments")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void projectsIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // No @MockBean for the projects repositories in this class -- they run for real against the
    // H2 test DB. V10 seeds no rows, so this returns 200 with an empty list (same reasoning as
    // compensationIsReachableForAnyAdminFamilyToken/paymentsIsReachableForAnyAdminFamilyToken).
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void projectsIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    // Asserts no Authorization header at all, not merely "any role passes" -- that alone
    // wouldn't catch a matcher that accidentally still required some token.
    @Test
    void brandingPublicIsReachableWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/company/branding/public"))
            .andExpect(status().isOk());
    }

    @Test
    void brandingLogoIsReachableWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/company/branding/logo/square"))
            .andExpect(status().isNotFound()); // no logo uploaded in this test's seeded row -- proves it passed security, not authorization
    }

    @Test
    void brandingFaviconIsReachableWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/company/branding/favicon"))
            .andExpect(status().isNotFound());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = {"ADMIN", "SUPER_ADMIN"})
    void createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens(AssociateRole role) throws Exception {
        // 400, not 403: an empty body fails bean validation, but that only happens after the
        // security layer let the request through -- which is the distinction being asserted.
        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = {"FINANCE", "KYC_REVIEWER", "SUPPORT", "ASSOCIATE"})
    void createAdminIsForbiddenForNonAdminTokens(AssociateRole role) throws Exception {
        // Narrower than the blanket ADMIN-family write rule: only ADMIN/SUPER_ADMIN may
        // provision new admin accounts, so the other admin-family roles (which CAN reach the
        // GET endpoints below) must still be rejected here.
        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminsListIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // associateRepository is @MockBean'd at the class level above (unstubbed here), and
    // Mockito's default answer returns an empty List rather than null for a List-returning
    // method, so findByRoleNotOrderByUserIdAsc(...) resolves to an empty roster and this is
    // a plain 200.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void adminsListIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void userIdAvailabilityIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/admins/user-id-available").param("userId", "someone")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void userIdAvailabilityIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/admins/user-id-available").param("userId", "someone")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void rolePermissionsIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/admins/role-permissions")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void rolePermissionsIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/admins/role-permissions")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void rootAssociatesListIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // Same unstubbed-default-empty-list reasoning as adminsListIsReachableForAnyAdminFamilyToken
    // above: associateRepository is @MockBean'd unstubbed, so
    // findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(...) resolves to an empty
    // list and this is a plain 200.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void rootAssociatesListIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void associatesListIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // Same unstubbed-default-empty-list reasoning as rootAssociatesListIsReachableForAnyAdminFamilyToken
    // above: associateRepository is @MockBean'd unstubbed, so findAllByOrderByUserIdAsc()
    // resolves to an empty list and this is a plain 200.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void associatesListIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/associates")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    // Single parameterized case covering every AssociateRole (unlike the paired
    // xIsForbiddenForAnAssociateToken/xIsReachableForAnyAdminFamilyToken tests above): asserts
    // 200 for every admin-family role and 403 for ASSOCIATE, driven off
    // AssociateRole.isAdminFamily() so this stays in sync with the matcher's own
    // hasAnyAuthority list without hardcoding two role lists here.
    //
    // settingsAuditLogRepository is not @MockBean'd in this class, so it runs for real against
    // the H2 test DB, which has no seeded rows -- same unstubbed-default-empty-result reasoning
    // as rootAssociatesListIsReachableForAnyAdminFamilyToken above, hence isOk() rather than a
    // populated body for the admin-family case.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/audit-log")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role.isAdminFamily() ? 200 : 403));
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
