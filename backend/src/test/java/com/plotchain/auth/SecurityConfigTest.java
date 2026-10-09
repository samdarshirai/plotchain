package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.announcement.AnnouncementRepository;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
    @Autowired AnnouncementRepository announcementRepository;
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

    // walletRepository is not @MockBean'd in this class, so it runs for real against the empty H2
    // test DB -- sumAllBalances() coalesces to 0, handled without error by AdminStatsService.
    // cycleRepository IS @MockBean'd class-wide (see the field above) -- Mockito's default answer for
    // an unstubbed Page-returning method is null (Page isn't one of Mockito's auto-emptied JDK
    // collection types), so this test stubs findAllByOrderByPeriodStartDesc to return an empty Page,
    // avoiding an NPE in AdminStatsService's now-unconditional call to that method.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate(AssociateRole role) throws Exception {
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any())).thenReturn(new PageImpl<>(List.of()));
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

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "POST /api/admin/cycles/{id}/credit-wallets, ADMIN-only"): same target-role-model reasoning
    // and first-match-wins placement as /api/admin/cycles/*/close directly above it in
    // SecurityConfig. cycleRepository.findByIdForUpdate is stubbed to return a CLOSED cycle so an
    // ADMIN token reaches 200; ledgerEntryRepository/walletRepository are NOT @MockBean'd in this
    // class, so the real WalletCreditingService runs against the empty H2 test DB, finds zero
    // PENDING entries, and completes as a legitimate no-op credit (entriesCredited = 0). Every
    // other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at the
    // filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesCreditWalletsIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setPeriodStart(java.time.LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(java.time.LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(post("/api/admin/cycles/{id}/credit-wallets", cycleId)
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "POST /api/admin/withdrawals, ADMIN-only"): same target-role-model reasoning as
    // /api/admin/cycles/*/credit-wallets directly above. A random, never-configured
    // associateId reaches the real (H2, unmocked-in-this-class) AssociateRepository... no --
    // AssociateRepository IS @MockBean'd class-wide here (see class-level @MockBean list), and
    // findById on an unstubbed UUID returns Optional.empty() by default, so an ADMIN token 404s
    // (AssociateNotFoundException) -- proof the request passed the security layer, not proof of
    // any particular business outcome, same "assert not 403" reasoning as
    // adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. Every other
    // role is blocked at the filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsSubmitIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.withdrawal.CreateWithdrawalRequest(UUID.randomUUID(), new java.math.BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
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
            new com.plotchain.sales.CreateSaleRequest(UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", "9999999999", null,
                UUID.randomUUID(), new java.math.BigDecimal("600000.00"), "Sold to Jane Buyer"));

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
            new com.plotchain.booking.CreateBookingRequest(UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", null, new java.math.BigDecimal("1000")));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingsCreateIsUnauthorizedWithoutAToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.booking.CreateBookingRequest(UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", null, new java.math.BigDecimal("1000")));
        mockMvc.perform(post("/api/admin/bookings").contentType("application/json").content(body))
            .andExpect(status().isUnauthorized());
    }

    // support-tickets unit 1 (Decision 8): POST /api/admin/support-tickets rides the blanket ADMIN
    // write rule plus @PreAuthorize. A random associateId reaches the real service for the ADMIN
    // token and 404s (the mocked AssociateRepository.findByIdAndRole is empty) -- proof the request
    // passed the security layer, not a business outcome. Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSupportTicketCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.supportticket.CreateSupportTicketRequest(UUID.randomUUID(), "Subject", "Description"));

        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminSupportTicketCreateIsUnauthorizedWithoutAToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.supportticket.CreateSupportTicketRequest(UUID.randomUUID(), "Subject", "Description"));
        mockMvc.perform(post("/api/admin/support-tickets").contentType("application/json").content(body))
            .andExpect(status().isUnauthorized());
    }

    // support-tickets unit 2 (Decision 8): there is NO blanket GET /api/admin/** rule, so the queue
    // GET needs its own matcher or an associate token falls through to anyRequest().authenticated().
    // ADMIN reaches the real controller and the real (H2) repository: an empty queue is 200,
    // proving the request passed the security layer. Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSupportTicketQueueIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets")
                .param("associateId", UUID.randomUUID().toString())
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    @Test
    void adminSupportTicketQueueIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets")).andExpect(status().isUnauthorized());
    }

    // "/api/admin/support-tickets" is an exact AntPathMatcher match and does not cover sub-paths;
    // the "/*" pattern keeps any future GET beneath it (and today's non-existent one) off
    // anyRequest().authenticated(). An associate must be 403, not 404/200.
    @Test
    void adminSupportTicketQueueSubPathIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // support-tickets unit 3 (Decision 8): POST .../{id}/respond rides the blanket ADMIN write rule
    // plus @PreAuthorize. A random ticket id reaches the real service for the ADMIN token and 404s
    // (no such ticket) -- proof it passed the security layer, same "not 403" reasoning as create.
    // Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSupportTicketRespondIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets/{id}/respond", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"status\":\"IN_PROGRESS\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminSupportTicketRespondIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets/{id}/respond", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"status\":\"IN_PROGRESS\"}"))
            .andExpect(status().isUnauthorized());
    }

    // plot-booking unit 2 (Decision 12): PATCH .../installments/{n}/pay rides the blanket ADMIN
    // write rule. A random booking id reaches the real BookingService for the ADMIN token, whose
    // findByIdForUpdate is empty -> 404, proving the request passed the security layer (same
    // "not 403" reasoning as adminBookingsCreate above). Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingPayIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(patch("/api/admin/bookings/{id}/installments/1/pay", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"amount\":100.00,\"paymentRef\":\"UTR-1\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingPayIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(patch("/api/admin/bookings/{id}/installments/1/pay", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"amount\":100.00,\"paymentRef\":\"UTR-1\"}"))
            .andExpect(status().isUnauthorized());
    }

    // plot-booking unit 4 (Decision 12): POST .../confirm rides the blanket ADMIN write rule. A random
    // booking id reaches the real BookingService for the ADMIN token and 404s (findByIdForUpdate empty),
    // proving the request passed the security layer; every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingConfirmIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/confirm", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingConfirmIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/confirm", UUID.randomUUID()))
            .andExpect(status().isUnauthorized());
    }

    // plot-booking unit 6 (Decision 12): POST .../cancel rides the blanket ADMIN write rule. ADMIN with a
    // random booking id reaches the real BookingService and 404s (proves it passed security); every other
    // role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingCancelIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/cancel", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"reason\":\"buyer withdrew\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingCancelIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/cancel", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"reason\":\"buyer withdrew\"}"))
            .andExpect(status().isUnauthorized());
    }

    // plot-booking unit 7 (Decision 12): POST .../transfer rides the blanket ADMIN write rule; no
    // SecurityConfig edit. Random booking id -> ADMIN reaches the real service and 404s; other roles 403.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingTransferIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingTransferIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().isUnauthorized());
    }

    // plot-booking unit 8 (Decision 12): GET /api/admin/bookings needs its OWN ADMIN matcher --
    // SecurityConfig has no blanket GET /api/admin/**, so without it any authenticated associate
    // would fall through to anyRequest().authenticated() and read every booking. ADMIN reaches the
    // real (H2, unmocked) register query and gets 200; every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingRegisterIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    @Test
    void adminBookingRegisterIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/bookings")).andExpect(status().isUnauthorized());
    }

    // plot-booking unit 14a: GET /api/admin/bookings/{id} needs its own ADMIN matcher. Unknown id
    // means ADMIN reaches the service and gets 404; every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingByIdIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/bookings/{id}", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingByIdIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/bookings/{id}", UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    // plot-booking unit 9 (Decision 12): GET /api/admin/emi-reports/overdue needs its OWN ADMIN
    // matcher (no blanket GET /api/admin/**); without it any associate token would read the report.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminOverdueEmiReportIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/emi-reports/overdue")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    @Test
    void adminOverdueEmiReportIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/emi-reports/overdue")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminBookingRegisterWithOverdueFilterIsAlsoAdminOnly() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").param("overdue", "true")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // plot-booking unit 10 (Decision 10): the plot grid is readable by ANY authenticated user. No SecurityConfig
    // matcher exists for /api/projects/**, so it falls through to anyRequest().authenticated(). ProjectRepository is
    // not @MockBean'd here, so a random project id is a genuine miss -> ProjectNotFoundException -> 404. Asserting
    // the precise 404 (not just "not 403") proves the request passed the security layer and reached the controller.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void plotGridIsReachableForEveryAuthenticatedRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/projects/" + UUID.randomUUID() + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isNotFound());
    }

    @Test
    void plotGridIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/projects/" + UUID.randomUUID() + "/plots/grid"))
            .andExpect(status().isUnauthorized());
    }

    // Proves the grid being open did not loosen the neighbouring admin-only plot GET: the thumbnail stays
    // ADMIN-only (associate 403, admin passes security -> unknown project 404).
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void plotGridOpenAccessDoesNotLoosenTheAdminOnlyThumbnailRead(AssociateRole role) throws Exception {
        int expected = role == AssociateRole.ASSOCIATE ? 403 : 404;
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(expected));
    }

    // epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // "POST /api/admin/epins, ADMIN-only", Decision 12): same target-role-model pattern as
    // adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole and
    // adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. EPinRepository
    // is NOT @MockBean'd in this class, so an ADMIN token reaches the real (H2, unmocked)
    // EPinRepository -- but tokenFor(role) never persists a real Associate row (only a mocked
    // AssociateRepository.findById stub), so the epin table's generated_by FK constraint (V33)
    // rejects the very first insert as a DataIntegrityViolationException, mapped to 409 by
    // ApiExceptionHandler. 409 (not 403) is what proves the request passed the security layer for
    // ADMIN, same "assert not 403" reasoning as adminWithdrawalsSubmitIsReachableOnlyFor... above.
    // Every other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at the
    // filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsGenerateBatchIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(new com.plotchain.epin.CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 409 : 403));
    }

    // epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // "Admin register -- GET /api/admin/epins, ADMIN-only", Decision 12): same target-role-model
    // pattern as adminSalesListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole and
    // adminLedgerListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. An ADMIN token
    // reaches the real (H2, unmocked) EPinRepository and gets 200 with an empty page -- there's
    // no not-found case for a list endpoint. Every other role, including the soon-to-be-deleted
    // admin-family sub-roles, is blocked at the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // "POST /api/admin/epins/{id}/redeem, ADMIN-only", Decision 12): same target-role-model
    // pattern as adminSalesVoidIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above.
    // EPinRepository is NOT @MockBean'd in this class, so an ADMIN token reaches the real (H2,
    // unmocked) EPinRepository -- a random, non-existent epinId 404s via EPinNotFoundException
    // (mapped by EPinExceptionHandler), proof the request passed the security layer, not proof
    // of any particular business outcome, same "assert not 403" reasoning as that void test.
    // Every other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at
    // the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsRedeemIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/epins/{id}/redeem", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    // e-PIN block/unblock/events are ADMIN-only; events is a GET so it needs its own matcher.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsBlockUnblockAndEventsAreForbiddenForEveryNonAdminRole(AssociateRole role) throws Exception {
        if (role == AssociateRole.ADMIN) return;
        String auth = "Bearer " + tokenFor(role);
        UUID id = UUID.randomUUID();
        mockMvc.perform(post("/api/admin/epins/{id}/block", id).header("Authorization", auth)
                .contentType("application/json").content("{\"reason\":\"x\"}"))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/epins/{id}/unblock", id).header("Authorization", auth))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/epins/{id}/events", id).header("Authorization", auth))
            .andExpect(status().isForbidden());
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

    // support-tickets unit 4: GET /api/associates/me/support-tickets needs no SecurityConfig matcher
    // (bare GET -> anyRequest().authenticated(), like /me/bookings above). Reachable by every
    // authenticated role (ADMIN ungated, spec Resolved decision 1); 401 without a token.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void associateMeSupportTicketsIsReachableByEveryAuthenticatedRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/associates/me/support-tickets")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(not(403)));
    }

    @Test
    void associateMeSupportTicketsIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/support-tickets"))
            .andExpect(status().isUnauthorized());
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

    // My Account "Bank Details" tab: PUT /api/associates/me/bank-details needs its own matcher
    // ABOVE the blanket ADMIN write rules, same ordering trap as profileUpdateIsReachableByAnAssociateToken
    // above. Only a 403 here would mean the matcher ordering regressed.
    @Test
    void bankDetailsUpdateIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/bank-details")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"bankName\":\"State Bank\",\"accountHolder\":\"Jane Doe\",\"accountNumber\":\"123456789012\",\"ifscCode\":\"SBIN0001234\",\"accountType\":\"SAVINGS\"}"))
            .andExpect(status().is(not(403)));
    }

    // Profile screen redesign: PUT /api/associates/me/nominee needs its own matcher ABOVE the
    // blanket ADMIN write rules, same ordering trap as bankDetailsUpdateIsReachableByAnAssociateToken
    // above. Only a 403 here would mean the matcher ordering regressed.
    @Test
    void nomineeUpdateIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/nominee")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"nomineeName\":\"Kajal Devi\",\"relation\":\"Wife\"}"))
            .andExpect(status().is(not(403)));
    }

    // Profile screen redesign: POST/DELETE /api/associates/me/photo need their own matchers
    // ABOVE the blanket ADMIN write rules, same ordering trap as the nominee/bank-details
    // matchers above. Only a 403 here would mean the matcher ordering regressed.
    @Test
    void photoUploadIsReachableByAnAssociateToken() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", new byte[]{1});

        mockMvc.perform(multipart("/api/associates/me/photo")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }

    @Test
    void photoRemoveIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/associates/me/photo")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }

    // Profile screen redesign: POST /api/associates/me/transaction-password needs its own
    // matcher ABOVE the blanket ADMIN write rules, same ordering trap as
    // passwordChangeIsReachableByAnAssociateToken above. Only a 403 here would mean the matcher
    // ordering regressed.
    @Test
    void transactionPasswordSetIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/associates/me/transaction-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"newTransactionPassword\":\"secret123\"}"))
            .andExpect(status().is(not(403)));
    }

    // epin-blog-extension unit 11: POST /api/associates/me/epins/{id}/redeem needs its own matcher
    // ABOVE the blanket ADMIN write rules. Only a 403 here means the ordering regressed.
    @Test
    void epinSelfRedeemIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/associates/me/epins/" + java.util.UUID.randomUUID() + "/redeem")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"userId\":\"VP00042\"}"))
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

    // Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // "Associate own ledger -- GET /api/associates/me/ledger, any authenticated associate"): needs
    // no explicit SecurityConfig matcher -- a bare GET never collides with the blanket
    // POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/sales already does
    // with no matcher of its own. This test proves the route is reachable by an ordinary
    // associate token, not accidentally blocked by 403.
    //
    // ledgerEntryRepository is not @MockBean'd in this class (same as
    // adminLedgerListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above), so search()
    // runs for real against the empty H2 test DB and returns an empty page. cycleRepository IS a
    // @MockBean here; findAllById on the unstubbed mock returns an empty list by default
    // (Mockito's ReturnsEmptyValues), so the request reaches 200 cleanly with no further stubbing
    // needed -- unlike associateMeSalesIsReachableByAnAssociateToken, which asserts "not 403"
    // because SaleService.getMySales trips a downstream 500 on an unstubbed downline lookup, this
    // endpoint has no such dependency and can assert a clean 200.
    @Test
    void associateMeLedgerIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }

    // Wallet/Withdrawal unit 2 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "GET /api/associates/me/wallet, any authenticated associate"): needs no explicit
    // SecurityConfig matcher -- a bare GET never collides with the blanket POST/PUT/PATCH/DELETE
    // write rules above, so it falls through to anyRequest().authenticated() below, the same way
    // GET /api/associates/me/dashboard and GET /api/associates/me/ledger already do with no
    // matcher of their own. This test proves the route is reachable by an ordinary associate
    // token, not accidentally blocked by 403.
    //
    // walletRepository is not @MockBean'd in this class, so findById runs for real against the
    // empty H2 test DB, finds nothing, and WalletController's lazy-default (Wallet.zero) kicks
    // in -- the request reaches a clean 200 with no further stubbing needed, same reasoning as
    // associateMeLedgerIsReachableByAnAssociateToken above.
    @Test
    void associateMeWalletIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }

    // Wallet/Withdrawal unit 9 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Own withdrawal history -- GET /api/associates/me/withdrawals, any authenticated
    // associate"): needs no explicit SecurityConfig matcher -- a bare GET never collides with the
    // blanket POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/ledger and GET
    // /api/associates/me/wallet already do with no matcher of their own. This test proves the
    // route is reachable by an ordinary associate token, not accidentally blocked by 403.
    //
    // WithdrawalRequestRepository is not @MockBean'd in this class (same "GET /api/admin/withdrawals
    // reaches the real, unmocked-here H2 DB" convention already established further up in this
    // file), so search() runs for real against the empty H2 test DB and returns an empty page --
    // the request reaches a clean 200 with no further stubbing needed, same reasoning as
    // associateMeLedgerIsReachableByAnAssociateToken above.
    @Test
    void associateMeWithdrawalsIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }

    // epin-extension unit 10: GET /api/associates/me/epins needs no matcher (falls through to
    // anyRequest().authenticated()); EPinRepository is not @MockBean'd here, so it runs for real
    // against the empty H2 DB and returns an empty page.
    @Test
    void associateMeEpinsIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
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

    // Two path segments past "/tree" ("/{associateId}/details"), which "/api/admin/tree/*"
    // does NOT cover (AntPathMatcher's "/*" is exactly one segment) -- needs its own explicit
    // "/api/admin/tree/*/details" matcher, or this falls through to anyRequest().authenticated()
    // and any associate could read hover details for an arbitrary associate.
    @Test
    void adminTreeNodeDetailsIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/tree/" + UUID.randomUUID() + "/details")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminKycIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // GET /api/admin/kyc/counts is a sub-path of the exact "/api/admin/kyc" matcher, which
    // AntPathMatcher does not treat as a prefix -- without the "/api/admin/kyc/*" pattern it
    // would fall through to anyRequest().authenticated() and be reachable by any associate.
    @Test
    void adminKycCountsIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/kyc/counts")
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

    // Income/Ledger unit 1: GET /api/admin/ledger is ADMIN-only, the same target-role-model
    // pattern as GET /api/admin/sales and GET /api/admin/cycles above. An ADMIN token reaches the
    // real (H2, unmocked) LedgerEntryRepository and gets 200 with an empty page -- there's no
    // not-found case for a list endpoint. Every other role, including the soon-to-be-deleted
    // admin-family sub-roles, is blocked at the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminLedgerListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/ledger")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Approval queue -- GET /api/admin/withdrawals, ADMIN-only"): same target-role-model
    // pattern as GET /api/admin/ledger directly above. An ADMIN token reaches the real
    // (H2, unmocked-here) WithdrawalRequestRepository and gets 200 with an empty page -- there's
    // no not-found case for a list endpoint. Every other role, including the
    // soon-to-be-deleted admin-family sub-roles, is blocked at the filter layer before the
    // controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    // Wallet/withdrawal unit 7 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Decide -- POST /api/admin/withdrawals/{id}/decision, ADMIN-only"): same target-role-model
    // pattern as POST /api/admin/withdrawals above. A random, never-persisted request id reaches
    // the real (H2, unmocked-here) WithdrawalRequestRepository and 404s for the ADMIN token
    // (WithdrawalRequestNotFoundException) -- proof the request passed the security layer, not
    // proof of any particular business outcome, same "assert not 403" reasoning as
    // adminWithdrawalsSubmitIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. Every
    // other role is blocked at the filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsDecideIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.withdrawal.WithdrawalDecisionRequest(
                com.plotchain.withdrawal.WithdrawalRequestStatus.APPROVED, null));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    // Wallet/withdrawal unit 8 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Disburse -- POST /api/admin/withdrawals/{id}/disburse, ADMIN-only"): same
    // target-role-model pattern as POST /api/admin/withdrawals/*/decision above. A random,
    // never-persisted request id reaches the real (H2, unmocked-here) WithdrawalRequestRepository
    // and 404s for the ADMIN token (WithdrawalRequestNotFoundException) -- proof the request
    // passed the security layer, not proof of any particular business outcome, same "assert not
    // 403" reasoning as adminWithdrawalsDecideIsReachableOnlyForAdminAndForbiddenForEveryOtherRole
    // above. Every other role is blocked at the filter layer before the controller/service ever
    // runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsDisburseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.withdrawal.DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void kycDecisionIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/kyc/" + UUID.randomUUID() + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"decision\":\"VERIFIED\"}"))
            .andExpect(status().isForbidden());
    }

    // announcements unit 1 (Decision 4): POST /api/admin/announcements rides the blanket ADMIN write
    // rule plus @PreAuthorize; no dedicated matcher. ADMIN reaches the real controller and the real
    // (H2) announcement table and gets 201, proving the request passed the security layer. Every
    // other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminAnnouncementComposeIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/admin/announcements")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"title\":\"Hello\",\"body\":\"World\"}"))
            .andReturn();
        try {
            assertEquals(role == AssociateRole.ADMIN ? 201 : 403, result.getResponse().getStatus());
        } finally {
            // Real repository / shared in-memory H2: remove the committed row even if an assertion
            // above fails, so it does not leak into other tests (announcements unit 2 feed tests).
            if (result.getResponse().getStatus() == 201) {
                String id = new ObjectMapper().readTree(result.getResponse().getContentAsString()).get("id").asText();
                announcementRepository.deleteById(UUID.fromString(id));
            }
        }
    }

    // announcements unit 2 (Decision 4): GET /api/announcements has no matcher and falls to
    // anyRequest().authenticated(), so EVERY role is 200. Real controller + real H2; the table's
    // contents are not asserted (shared across test classes), only that the request is allowed
    // and the page shape is returned.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void announcementFeedIsReachableForEveryRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/announcements")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isArray());
    }

    @Test
    void announcementFeedIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/announcements")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminAnnouncementComposeIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/announcements")
                .contentType("application/json")
                .content("{\"title\":\"Hello\",\"body\":\"World\"}"))
            .andExpect(status().isUnauthorized());
    }
}
