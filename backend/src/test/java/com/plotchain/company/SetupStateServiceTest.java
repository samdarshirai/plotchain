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

    SetupStateService setupStateService;

    @BeforeEach
    void setUp() {
        setupStateService = new SetupStateService(setupStateRepository);
    }

    private SetupState unlaunchedState() {
        return new SetupState();
    }

    @Test
    void everyStepIsIncompleteUntilItsOwnPhaseLands() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps()).hasSize(8);
        assertThat(response.steps()).allMatch(s -> !s.complete() && s.percentComplete() == 0);
        assertThat(response.canGoLive()).isFalse();
        assertThat(response.launchedAt()).isNull();
    }

    @Test
    void onlyCompanyProfileCompensationAndPaymentsKycAreRequired() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream().filter(SetupStateResponse.StepStatus::required)
            .map(SetupStateResponse.StepStatus::key))
            .containsExactlyInAnyOrder("companyProfile", "compensation", "paymentsKyc");
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

        assertThatThrownBy(() -> setupStateService.launch())
            .isInstanceOf(LaunchBlockedException.class)
            .satisfies(ex -> assertThat(((LaunchBlockedException) ex).getIncompleteSteps())
                .containsExactlyInAnyOrder("companyProfile", "compensation", "paymentsKyc"));

        verify(setupStateRepository, org.mockito.Mockito.never()).save(org.mockito.ArgumentMatchers.any());
    }
}
