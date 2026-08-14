package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SetupState;
import com.plotchain.company.SetupStateRepository;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
    @MockBean CycleRepository cycleRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
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

    private void stubEmptyCyclePage() {
        when(cycleRepository.findAllByOrderByPeriodStartDesc(org.springframework.data.domain.PageRequest.of(0, 20)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));
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
    void projectsIsReachableForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }

    @Test
    void projectThumbnailIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // ProjectRepository is not @MockBean'd in this class (same "real H2, unseeded" reasoning
    // as projectsIsReachableForAnyAdminFamilyToken above), so a random project id is a genuine
    // miss: ProjectService.get() throws ProjectNotFoundException, mapped by
    // ProjectsExceptionHandler to 404. Asserting the precise 404 (not just "not 403") proves
    // the request passed the security layer via the new .authenticated() matcher rather than
    // happening to land on some other non-403 status.
    @Test
    void projectDetailIsReachableForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isNotFound());
    }

    // PlotRepository is not @MockBean'd either, and PlotService.list() never checks the
    // project exists before querying -- an unknown projectId yields a real, empty page (200),
    // not a 404. Asserting the precise 200 proves the request passed the security layer.
    @Test
    void projectPlotsListIsReachableForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/plots")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }

    // Unlike the plots list above, PlotService.get() does look the plot up and throws
    // PlotNotFoundException (404) when it's missing -- same reasoning as
    // projectDetailIsReachableForAnAssociateToken.
    @Test
    void plotDetailIsReachableForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/plots/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isNotFound());
    }

    // ProjectService.getThumbnail() also throws ProjectNotFoundException for an unknown id,
    // but that's a 404 from ProjectsExceptionHandler -- an ADMIN token must get PAST the
    // security layer first to ever see it, so 404 (not 403) is what proves this matcher still
    // grants ADMIN access after the split.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void projectThumbnailIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isNotFound());
    }

    @Test
    void csvTemplateIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/plots/csv-template")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // PlotCsvController.csvTemplate() does no DB lookup -- it always returns 200 with
    // generated CSV bytes, so an ADMIN token reaching 200 (not 404, unlike the thumbnail
    // case above) is the correct proof this matcher still grants ADMIN access.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void csvTemplateIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/projects/plots/csv-template")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
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

    @Test
    void associatesListIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // Same unstubbed-default-empty-list reasoning as brandingLogoIsReachableWithoutAToken and
    // brandingFaviconIsReachableWithoutAToken above: associateRepository is @MockBean'd
    // unstubbed, so findAllByOrderByUserIdAsc() resolves to an empty list and this is a plain
    // 200.
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
    // the H2 test DB, which has no seeded rows -- an unstubbed-default-empty-result, hence
    // isOk() rather than a populated body for the admin-family case.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/audit-log")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // Same reasoning as auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate above:
    // walletRepository/cycleRepository are not @MockBean'd in this class, so they run for real
    // against the empty H2 test DB -- sumAllBalances() coalesces to 0 and there's no OPEN cycle,
    // both handled without error by AdminStatsService, hence isOk() for every admin-family role.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/stats")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // Deliberately NOT the isAdminFamily() convention used by the other parameterized tests in
    // this file (e.g. adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate).
    // This route is built directly to the target role model from
    // docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md
    // (role-capability unit 1, approved, not yet implemented): only ADMIN gets 200 here, every
    // other role — including the SUPER_ADMIN/FINANCE/KYC_REVIEWER/SUPPORT roles that unit deletes
    // outright — gets 403, same as ASSOCIATE. cycleRepository is @MockBean'd here.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        stubEmptyCyclePage();
        mockMvc.perform(get("/api/admin/cycles")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // ADMIN-only, cycle-management unit 2's GET /api/admin/cycles/{id} matcher -- same
    // target-role-model reasoning as the list matcher directly above, not the isAdminFamily()
    // convention most other admin GETs use. "/api/admin/cycles" (the list matcher) is an exact
    // Ant-pattern match and does NOT cover this path as a prefix, so this route needs its own
    // matcher or it would fall through to the blanket anyRequest().authenticated() and become
    // reachable by any authenticated associate. cycleRepository.findById is stubbed to return a
    // real cycle so an ADMIN token reaches 200; ledgerEntryRepository is not @MockBean'd in this
    // class, so its sum queries run for real against the empty H2 test DB and return 0.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesDetailIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setPeriodStart(java.time.LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(java.time.LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        when(cycleRepository.findById(cycleId)).thenReturn(Optional.of(cycle));

        mockMvc.perform(get("/api/admin/cycles/{id}", cycleId)
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // ADMIN-only, cycle-management unit 3's POST /api/admin/cycles/{id}/close matcher --
    // declared up near the file's other narrower POST rules, before the blanket POST rule
    // (see that matcher's own comment for why it isn't declared here next to the sibling GET
    // matcher above). cycleRepository.findByIdForUpdate is stubbed to return an OPEN cycle so
    // an ADMIN token reaches 200; every other role, including the soon-to-be-deleted
    // admin-family sub-roles, gets 403 at the filter layer before the controller/service ever
    // runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesCloseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setPeriodStart(java.time.LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(java.time.LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(cycle));
        // Cycle-management unit 4: close() now runs the real settlement batch (leg-volume
        // rollup, CALCULATING/CLOSED flips, getOrOpenCurrent() reopen) for the ADMIN case
        // instead of unit 3's placeholder, so save() must echo back its argument like
        // CycleServiceTest's own tests do -- otherwise Mockito's default null return for an
        // unstubbed Cycle-returning method NPEs on getOrOpenCurrent()'s reopened cycle.
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // Sales unit 2: POST /api/admin/sales is ADMIN-only, the same target-role-model pattern as
    // /api/admin/cycles/*/close above (not the isAdminFamily() convention most other admin GETs
    // still use). A random, non-existent plotId reaches the real (H2, unmocked) PlotRepository
    // and 404s for the ADMIN token -- proof the request passed the security layer, not proof of
    // any particular business outcome, same "assert not 403" reasoning as
    // passwordChangeIsReachableByAnAssociateToken above. Every other role, including the
    // soon-to-be-deleted admin-family sub-roles, is blocked at the filter layer before the
    // controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.sales.CreateSaleRequest(UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", "9999999999", null));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    // Role-capability unit 7 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
    // Plot/project inventory row, Admin column: "books plots against any associate's record"):
    // POST /api/admin/bookings is ADMIN-only, same target-role-model pattern and first-match-wins
    // placement as the Sales matchers directly above. A random, non-existent plotId reaches the
    // real (H2, unmocked) PlotRepository and 404s for the ADMIN token -- proof the request passed
    // the security layer, not proof of any particular business outcome, same "assert not 403"
    // reasoning as passwordChangeIsReachableByAnAssociateToken elsewhere in this file. Every
    // other role is blocked at the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.booking.CreateBookingRequest(UUID.randomUUID(), UUID.randomUUID()));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    // Role-capability unit 7: GET /api/associates/me/bookings needs no explicit SecurityConfig
    // matcher -- a bare GET never collides with the blanket POST/PUT/PATCH/DELETE write rules
    // above, so it falls through to anyRequest().authenticated() below, the same way GET
    // /api/associates/me/sales already does with no matcher of its own. This test proves the
    // route is reachable by an ordinary associate token, not accidentally blocked by 403.
    @Test
    void associateMeBookingsIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
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

    // Role-capability unit 8: POST /api/associates/me/kyc/documents/{type} needs its own
    // matcher ABOVE the blanket ADMIN write rules, same ordering trap as
    // passwordChangeIsReachableByAnAssociateToken above. AssociateKycDocumentRepository is not
    // @MockBean'd in this class (same "some repositories run for real against H2" convention
    // as compensation/payments/projects above), and associateRepository IS a @MockBean here
    // returning a fake associate never actually persisted to the real H2 database -- so the
    // real AssociateKycDocumentRepository.save() hits a foreign-key violation against that
    // non-existent associate row, surfacing as a 409 via ApiExceptionHandler's
    // DataIntegrityViolationException mapping. Whether it lands on 409 (FK violation) or some
    // other non-403 status doesn't matter for this test -- only a 403 here would mean the
    // matcher ordering regressed.
    @Test
    void kycDocumentUploadIsReachableByAnAssociateToken() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }

    // Role-capability unit 11: PUT /api/associates/me/profile needs its own matcher ABOVE the
    // blanket ADMIN write rules, same ordering trap as passwordChangeIsReachableByAnAssociateToken
    // and kycDocumentUploadIsReachableByAnAssociateToken above. associateRepository is a
    // @MockBean here returning a fake associate never actually persisted to the real H2
    // database, and existsByEmail is unstubbed (defaults to false via Mockito), so the request
    // reaches AssociateProfileService.updateProfile and succeeds -- 200, not 403. Only a 403 here
    // would mean the matcher ordering regressed.
    @Test
    void profileUpdateIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"name\":\"Jane Doe\",\"phone\":\"9990001111\",\"email\":\"jane@example.com\"}"))
            .andExpect(status().is(not(403)));
    }

    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales, any authenticated associate"): needs
    // no explicit SecurityConfig matcher -- a bare GET never collides with the blanket
    // POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/dashboard already
    // does with no matcher of its own. This test proves the route is reachable by an ordinary
    // associate token, not accidentally blocked by 403.
    //
    // AssociateRepository is a @MockBean in this test class; findSelfAndDownlineIds is
    // unstubbed and returns null by default, which SaleService.getMySales()'s call chain trips
    // on downstream (a null ID list reaching the real, unmocked SaleRepository) -- a 500, not a
    // 403. Same "assert not 403" reasoning as passwordChangeIsReachableByAnAssociateToken above:
    // only a 403 here would mean the route regressed to being blocked at the security layer.
    @Test
    void associateMeSalesIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }

    // role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
    // "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
    // (read-only)"): needs no explicit SecurityConfig matcher -- a bare GET never collides with
    // the blanket POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/dashboard and GET
    // /api/associates/me/sales already do with no matcher of their own. This test proves the route
    // is reachable by an ordinary associate token, not accidentally blocked by 403.
    //
    // tokenFor(role) mints a random associateId and stubs associateRepository.findById(...) to
    // return a bare Associate with no rankId set, so the request reaches
    // CompensationPlanService.getMyRankProgress and throws NoRankAssignedException (409) -- not a
    // 403. Same "assert not 403" reasoning as associateMeSalesIsReachableByAnAssociateToken above:
    // only a 403 here would mean the route regressed to being blocked at the security layer.
    @Test
    void associateMeRankProgressIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/rank-progress")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }

    // role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
    // "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)"):
    // needs no explicit SecurityConfig matcher -- a bare GET never collides with the blanket
    // POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/dashboard, GET
    // /api/associates/me/sales, and GET /api/associates/me/rank-progress already do with no
    // matcher of their own. This test proves the route is reachable by an ordinary associate
    // token, not accidentally blocked by 403.
    //
    // tokenFor(role) mints a random associateId and stubs associateRepository.findById(...) to
    // return a bare Associate with no rankId set, so the request reaches
    // AssociateIdCardService.getMyIdCard and throws NoRankAssignedException (409) -- not a 403.
    // Same "assert not 403" reasoning as associateMeRankProgressIsReachableByAnAssociateToken
    // above: only a 403 here would mean the route regressed to being blocked at the security
    // layer.
    @Test
    void associateMeIdCardIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/id-card")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }

    @Test
    void adminAssociatesIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminTreeIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/tree/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminKycIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // Sales unit 4: POST /api/admin/sales/{id}/void is ADMIN-only, the same target-role-model
    // pattern as POST /api/admin/sales directly above and /api/admin/cycles/*/close further up.
    // A random, non-existent saleId reaches the real (H2, unmocked) SaleRepository and 404s for
    // the ADMIN token -- proof the request passed the security layer, not proof of any
    // particular business outcome, same "assert not 403" reasoning as
    // passwordChangeIsReachableByAnAssociateToken below. Every other role, including the
    // soon-to-be-deleted admin-family sub-roles, is blocked at the filter layer before the
    // controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSalesVoidIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/sales/{id}/void", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    // Sales unit 6: GET /api/admin/sales is ADMIN-only, the same target-role-model pattern as
    // the record/void matchers above and GET /api/admin/cycles further up. An ADMIN token
    // reaches the real (H2, unmocked) SaleRepository and gets 200 with an empty page -- there's
    // no not-found case for a list endpoint, unlike record/void's single-resource lookups.
    // Every other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at
    // the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSalesListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    @Test
    void kycDecisionIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/kyc/" + UUID.randomUUID() + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"decision\":\"VERIFIED\"}"))
            .andExpect(status().isForbidden());
    }
}
