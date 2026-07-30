package com.plotchain.company;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SetupStateServiceTest {

    @Mock SetupStateRepository setupStateRepository;
    // CompanyProfileService/CompanyBrandingService are concrete classes -- this JDK's
    // Mockito/ByteBuddy can't instrument concrete classes, so real instances are built over
    // mocked (interface) repositories instead, per the repo's established pattern (see
    // AuthControllerTest).
    @Mock CompanyProfileRepository companyProfileRepository;
    @Mock CompanyBrandingRepository companyBrandingRepository;

    SetupStateService setupStateService;

    @BeforeEach
    void setUp() {
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository),
            new CompanyBrandingService(companyBrandingRepository, new CompanyProfileService(companyProfileRepository)));
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

    @Test
    void everyStepIsIncompleteUntilItsOwnPhaseLands() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());

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

        assertThatThrownBy(() -> setupStateService.launch())
            .isInstanceOf(LaunchBlockedException.class)
            .satisfies(ex -> assertThat(((LaunchBlockedException) ex).getIncompleteSteps())
                .containsExactlyInAnyOrder("companyProfile", "compensation", "paymentsKyc"));

        verify(setupStateRepository, org.mockito.Mockito.never()).save(org.mockito.ArgumentMatchers.any());
    }
}
