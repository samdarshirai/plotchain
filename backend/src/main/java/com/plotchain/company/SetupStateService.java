package com.plotchain.company;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class SetupStateService {

    // Order and required-ness match the master roadmap's 8-step wizard and its Step 8 "canGoLive"
    // gate (Company Profile + Compensation + Payments & KYC). Every step reports incomplete until
    // its own phase (4-11) lands and replaces its arm in isStepComplete below.
    private static final List<StepDefinition> STEP_DEFINITIONS = List.of(
        new StepDefinition(1, "companyProfile", true),
        new StepDefinition(2, "branding", false),
        new StepDefinition(3, "compensation", true),
        new StepDefinition(4, "projects", false),
        new StepDefinition(5, "paymentsKyc", true),
        new StepDefinition(6, "adminTeam", false),
        new StepDefinition(7, "rootAssociates", false),
        new StepDefinition(8, "reviewLaunch", false)
    );

    private final SetupStateRepository setupStateRepository;

    public SetupStateService(SetupStateRepository setupStateRepository) {
        this.setupStateRepository = setupStateRepository;
    }

    public SetupStateResponse getSetupState() {
        SetupState state = currentState();
        List<SetupStateResponse.StepStatus> steps = STEP_DEFINITIONS.stream()
            .map(def -> {
                boolean complete = isStepComplete(def.key());
                return new SetupStateResponse.StepStatus(def.number(), def.key(), complete, def.required(), complete ? 100 : 0);
            })
            .toList();
        boolean canGoLive = steps.stream()
            .filter(SetupStateResponse.StepStatus::required)
            .allMatch(SetupStateResponse.StepStatus::complete);
        return new SetupStateResponse(steps, canGoLive, state.getLaunchedAt());
    }

    public boolean isLaunched() {
        return currentState().getLaunchedAt() != null;
    }

    public SetupStateResponse launch() {
        SetupStateResponse current = getSetupState();
        if (!current.canGoLive()) {
            List<String> incomplete = current.steps().stream()
                .filter(s -> s.required() && !s.complete())
                .map(SetupStateResponse.StepStatus::key)
                .toList();
            throw new LaunchBlockedException(incomplete);
        }
        SetupState state = currentState();
        Instant now = Instant.now();
        state.setTermsAcceptedAt(now);
        state.setLaunchedAt(now);
        state.setUpdatedAt(now);
        setupStateRepository.save(state);
        return getSetupState();
    }

    // Stubbed until each step's own phase lands; every arm currently returns false.
    private boolean isStepComplete(String key) {
        return false;
    }

    private SetupState currentState() {
        return setupStateRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("setup_state row missing - V5 migration seeds it"));
    }

    private record StepDefinition(int number, String key, boolean required) {}
}
