package com.plotchain.company;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateIdGenerator;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.compensation.CompensationPlanService;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RewardTierRepository;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.payments.PaymentConfig;
import com.plotchain.payments.PaymentConfigRepository;
import com.plotchain.payments.PaymentConfigService;
import com.plotchain.payments.PayoutBankAccount;
import com.plotchain.payments.PayoutBankAccountRepository;
import com.plotchain.payments.PayoutBankAccountService;
import com.plotchain.payments.SecretsEncryptionService;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.projects.ProjectService;
import com.plotchain.projects.PlotRepository;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SetupStateServiceTest {

    @Mock SetupStateRepository setupStateRepository;
    // CompanyProfileService/CompanyBrandingService/CompensationPlanService are concrete classes.
    // This repo's convention (see AuthControllerTest and every other service test) is to mock
    // repository *interfaces* only and instantiate services for real over those mocks, rather
    // than mocking the service classes themselves -- so real instances are built here too.
    @Mock CompanyProfileRepository companyProfileRepository;
    @Mock CompanyBrandingRepository companyBrandingRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock RewardTierRepository rewardTierRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock PaymentConfigRepository paymentConfigRepository;
    @Mock PayoutBankAccountRepository payoutBankAccountRepository;
    @Mock ProjectRepository projectRepository;
    @Mock PlotRepository plotRepository;
    // SettingsAuditService is a concrete class, same as CompanyProfileService/
    // CompanyBrandingService above -- a real instance is built over mocked (interface)
    // repositories per the same repo convention.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    // AdminProvisioningService is a concrete class, same as CompanyProfileService/
    // CompanyBrandingService/CompensationPlanService above -- a real instance is built over
    // mocked (interface) repositories per the same repo convention.
    @Mock AssociateRepository associateRepository;
    @Mock PasswordEncoder passwordEncoder;

    SetupStateService setupStateService;

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            new CompensationPlanService(
                compensationPlanVersionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository),
            new PaymentConfigService(paymentConfigRepository,
                new SecretsEncryptionService("test-secrets-key-at-least-32-bytes-long-for-aes")),
            new PayoutBankAccountService(payoutBankAccountRepository),
            new ProjectService(projectRepository, plotRepository),
            new AdminProvisioningService(associateRepository, passwordEncoder),
            new RootAssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder,
                new AssociateIdGenerator(associateRepository, "VP")));

        // getSetupState() calls isStepComplete("paymentsKyc") on every invocation, so every test
        // needs this stubbed even if it never asserts on paymentsKyc directly. lenient() because
        // isLaunched()/isNotLaunched() below don't call getSetupState() at all and would
        // otherwise trip strict-stubbing's unnecessary-stub check.
        lenient().when(paymentConfigRepository.findAll()).thenReturn(List.of(new PaymentConfig()));
        lenient().when(payoutBankAccountRepository.findAll()).thenReturn(List.of(new PayoutBankAccount()));
        // "projects" is non-required and defaults to no projects existing, matching the other
        // non-required steps' default-incomplete stubbing above.
        lenient().when(projectRepository.findAll()).thenReturn(List.of());
        // "adminTeam" is non-required and defaults to no admin-family rows beyond none at all,
        // matching the other non-required steps' default-incomplete stubbing above.
        lenient().when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(0L);
        // "rootAssociates" is non-required and defaults to no root existing yet, matching the
        // other non-required steps' default-incomplete stubbing above.
        lenient()
            .when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of());
    }

    private void stubPaymentsKycComplete() {
        PaymentConfig payment = new PaymentConfig();
        payment.setGateway("RAZORPAY");
        payment.setCredentialsEncrypted("encrypted-value");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(payment));

        PayoutBankAccount account = new PayoutBankAccount();
        account.setBankName("HDFC Bank");
        account.setAccountHolder("Plotchain Estates Pvt Ltd");
        account.setAccountNumber("50100123456789");
        account.setIfscCode("HDFC0001234");
        account.setAccountType("CURRENT");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(account));
    }

    private SetupState unlaunchedState() {
        return new SetupState();
    }

    private void stubCompanyProfile(CompanyProfile profile) {
        when(companyProfileRepository.findAll()).thenReturn(List.of(profile));
    }

    private void stubCompanyBranding(CompanyBranding branding) {
        when(companyBrandingRepository.findAll()).thenReturn(List.of(branding));
    }

    private CompanyBranding blankBranding() {
        CompanyBranding branding = new CompanyBranding();
        branding.setPrimaryColor("#7C3AED");
        branding.setSecondaryColor("#22D3EE");
        return branding;
    }

    // Mirrors the V8-seeded row: every column populated, created_by_associate_id NULL. This is
    // what CompensationPlanService.isComplete() sees until an admin actually saves a version, so
    // every existing test below must stub this to keep "compensation" incomplete (its old
    // free/unconditional-false behavior under the previous stub arm).
    private CompensationPlanVersion seedCompensationVersion() {
        return new CompensationPlanVersion(
            UUID.randomUUID(),
            "v1",
            LocalDate.of(2000, 1, 1),
            new BigDecimal("10.00"),
            new BigDecimal("7.00"),
            new BigDecimal("5.00"),
            new BigDecimal("2.00"),
            new BigDecimal("5.00"),
            new BigDecimal("15.00"),
            new BigDecimal("1100.00"),
            new BigDecimal("500.00"),
            SettlementCycle.SEMI_MONTHLY,
            Instant.parse("2020-01-01T00:00:00Z"),
            null);
    }

    private CompensationPlanVersion savedCompensationVersion(UUID createdByAssociateId) {
        return new CompensationPlanVersion(
            UUID.randomUUID(),
            "v2",
            LocalDate.now(),
            new BigDecimal("10.00"),
            new BigDecimal("7.00"),
            new BigDecimal("5.00"),
            new BigDecimal("2.00"),
            new BigDecimal("5.00"),
            new BigDecimal("15.00"),
            new BigDecimal("1100.00"),
            new BigDecimal("500.00"),
            SettlementCycle.SEMI_MONTHLY,
            Instant.now(),
            createdByAssociateId);
    }

    private void stubCompensationIncomplete() {
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now()))
            .thenReturn(Optional.of(seedCompensationVersion()));
    }

    private void stubCompensationComplete() {
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now()))
            .thenReturn(Optional.of(savedCompensationVersion(UUID.randomUUID())));
    }

    @Test
    void everyStepIsIncompleteUntilItsOwnPhaseLands() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps()).hasSize(8);
        assertThat(response.steps()).allMatch(s -> !s.complete() && s.percentComplete() == 0);
        assertThat(response.canGoLive()).isFalse();
        assertThat(response.launchedAt()).isNull();
    }

    @Test
    void onlyCompanyProfileCompensationAndPaymentsKycAreRequired() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream().filter(SetupStateResponse.StepStatus::required)
            .map(SetupStateResponse.StepStatus::key))
            .containsExactlyInAnyOrder("companyProfile", "compensation", "paymentsKyc");
    }

    @Test
    void companyProfileStepIsCompleteWhenCompanyProfileServiceReportsComplete() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        CompanyProfile filled = new CompanyProfile();
        filled.setDisplayName("Plotchain Estates");
        filled.setLegalName("Plotchain Estates Private Limited");
        filled.setContactName("Jane Doe");
        filled.setContactPhone("+919876543210");
        filled.setContactEmail("jane@plotchain.test");
        filled.setRegisteredAddress("123 MG Road, Bengaluru");
        stubCompanyProfile(filled);
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("companyProfile")).findFirst().orElseThrow().complete())
            .isTrue();
        // compensation and paymentsKyc are still stubbed incomplete, so the overall gate stays closed.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void brandingStepIsCompleteWhenBrandingServiceReportsComplete() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        CompanyBranding brandedRow = blankBranding();
        brandedRow.setLogoSquare(new byte[]{1});
        brandedRow.setTagline("Land you can trust");
        stubCompanyBranding(brandedRow);
        stubCompensationIncomplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("branding")).findFirst().orElseThrow().complete())
            .isTrue();
        // Branding is optional -- completing it must not affect the Go Live gate.
        assertThat(response.canGoLive()).isFalse();
        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("branding")).findFirst().orElseThrow().required())
            .isFalse();
    }

    @Test
    void isLaunchedReflectsLaunchedAt() {
        SetupState launched = unlaunchedState();
        launched.setLaunchedAt(Instant.now());
        when(setupStateRepository.findAll()).thenReturn(List.of(launched));

        assertThat(setupStateService.isLaunched()).isTrue();
    }

    @Test
    void isNotLaunchedWhenLaunchedAtIsNull() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));

        assertThat(setupStateService.isLaunched()).isFalse();
    }

    @Test
    void launchThrowsWhenRequiredStepsAreIncomplete() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();

        assertThatThrownBy(() -> setupStateService.launch())
            .isInstanceOf(LaunchBlockedException.class)
            .satisfies(ex -> assertThat(((LaunchBlockedException) ex).getIncompleteSteps())
                .containsExactlyInAnyOrder("companyProfile", "compensation", "paymentsKyc"));

        verify(setupStateRepository, org.mockito.Mockito.never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void compensationStepIsCompleteWhenAnAdminHasSavedAVersion() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationComplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("compensation")).findFirst().orElseThrow().complete())
            .isTrue();
        // companyProfile and paymentsKyc are still stubbed incomplete, so the overall gate stays closed.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void canGoLiveRequiresCompanyProfileCompensationAndPaymentsKycIndependently() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        CompanyProfile filled = new CompanyProfile();
        filled.setDisplayName("Plotchain Estates");
        filled.setLegalName("Plotchain Estates Private Limited");
        filled.setContactName("Jane Doe");
        filled.setContactPhone("+919876543210");
        filled.setContactEmail("jane@plotchain.test");
        filled.setRegisteredAddress("123 MG Road, Bengaluru");
        stubCompanyProfile(filled);
        stubCompanyBranding(blankBranding());
        // Compensation IS complete here, but Payments & KYC is left at setUp()'s default
        // (blank payment config/bank account) -- canGoLive() must still be false, proving the
        // three gates are checked independently rather than any single one being sufficient.
        stubCompensationComplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("companyProfile")).findFirst().orElseThrow().complete())
            .isTrue();
        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("compensation")).findFirst().orElseThrow().complete())
            .isTrue();
        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("paymentsKyc")).findFirst().orElseThrow().complete())
            .isFalse();
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void paymentsKycStepIsCompleteWhenPaymentConfigAndPayoutBankAccountAreBothComplete() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        stubPaymentsKycComplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("paymentsKyc")).findFirst().orElseThrow().complete())
            .isTrue();
        // companyProfile and compensation are still incomplete, so the overall gate stays closed.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void canGoLiveIsTrueOnceCompanyProfileCompensationAndPaymentsKycAreAllComplete() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        CompanyProfile filled = new CompanyProfile();
        filled.setDisplayName("Plotchain Estates");
        filled.setLegalName("Plotchain Estates Private Limited");
        filled.setContactName("Jane Doe");
        filled.setContactPhone("+919876543210");
        filled.setContactEmail("jane@plotchain.test");
        filled.setRegisteredAddress("123 MG Road, Bengaluru");
        stubCompanyProfile(filled);
        stubCompanyBranding(blankBranding());
        stubCompensationComplete();
        stubPaymentsKycComplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.canGoLive()).isTrue();
    }

    @Test
    void projectsStepIsCompleteWhenAProjectHasAtLeastOnePlot() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        UUID projectId = UUID.randomUUID();
        when(projectRepository.findAll()).thenReturn(
            List.of(new Project(projectId, "Green Valley", "Hyderabad", null, null, Instant.now())));
        when(plotRepository.existsByProjectId(projectId)).thenReturn(true);

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("projects")).findFirst().orElseThrow().complete())
            .isTrue();
        // Projects is optional -- completing it must not affect the Go Live gate.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void adminTeamStepIsIncompleteWithOnlyOneAdminFamilyRow() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(1L);

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("adminTeam")).findFirst().orElseThrow().complete())
            .isFalse();
        // adminTeam is optional -- canGoLive is unaffected either way.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void adminTeamStepIsCompleteWithTwoOrMoreAdminFamilyRows() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(2L);

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("adminTeam")).findFirst().orElseThrow().complete())
            .isTrue();
        // adminTeam is optional -- completing it must not affect the Go Live gate.
        assertThat(response.canGoLive()).isFalse();
        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("adminTeam")).findFirst().orElseThrow().required())
            .isFalse();
    }

    @Test
    void rootAssociatesStepIsIncompleteWithNoRoots() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("rootAssociates")).findFirst().orElseThrow().complete())
            .isFalse();
        // rootAssociates is optional -- canGoLive is unaffected either way.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void rootAssociatesStepIsCompleteWithOneRoot() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        com.plotchain.associate.Associate root = new com.plotchain.associate.Associate();
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(root));

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("rootAssociates")).findFirst().orElseThrow().complete())
            .isTrue();
        // rootAssociates is optional -- completing it must not affect the Go Live gate.
        assertThat(response.canGoLive()).isFalse();
        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("rootAssociates")).findFirst().orElseThrow().required())
            .isFalse();
    }

    @Test
    void reviewLaunchStepBecomesCompleteOnceLaunched() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        CompanyProfile filled = new CompanyProfile();
        filled.setDisplayName("Plotchain Estates");
        filled.setLegalName("Plotchain Estates Private Limited");
        filled.setContactName("Jane Doe");
        filled.setContactPhone("+919876543210");
        filled.setContactEmail("jane@plotchain.test");
        filled.setRegisteredAddress("123 MG Road, Bengaluru");
        stubCompanyProfile(filled);
        stubCompanyBranding(blankBranding());
        stubCompensationComplete();
        stubPaymentsKycComplete();

        SetupStateResponse before = setupStateService.getSetupState();
        assertThat(before.steps().stream()
            .filter(s -> s.key().equals("reviewLaunch")).findFirst().orElseThrow().complete())
            .isFalse();

        SetupStateResponse after = setupStateService.launch();

        assertThat(after.steps().stream()
            .filter(s -> s.key().equals("reviewLaunch")).findFirst().orElseThrow().complete())
            .isTrue();
    }
}
