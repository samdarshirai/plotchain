package com.plotchain.company;

import com.plotchain.compensation.CompensationPlanService;
import com.plotchain.payments.PaymentConfigService;
import com.plotchain.payments.PayoutBankAccountService;
import com.plotchain.projects.ProjectService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class SetupStateService {

    // Order and required-ness match the master roadmap's 8-step wizard and its Step 8 "canGoLive"
    // gate (Company Profile + Compensation + Payments & KYC).
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
    private final CompanyProfileService companyProfileService;
    private final CompanyBrandingService companyBrandingService;
    private final CompensationPlanService compensationPlanService;
    private final PaymentConfigService paymentConfigService;
    private final PayoutBankAccountService payoutBankAccountService;
    private final ProjectService projectService;
    private final AdminProvisioningService adminProvisioningService;
    private final RootAssociateProvisioningService rootAssociateProvisioningService;

    public SetupStateService(SetupStateRepository setupStateRepository,
                              CompanyProfileService companyProfileService,
                              CompanyBrandingService companyBrandingService,
                              CompensationPlanService compensationPlanService,
                              PaymentConfigService paymentConfigService,
                              PayoutBankAccountService payoutBankAccountService,
                              ProjectService projectService,
                              AdminProvisioningService adminProvisioningService,
                              RootAssociateProvisioningService rootAssociateProvisioningService) {
        this.setupStateRepository = setupStateRepository;
        this.companyProfileService = companyProfileService;
        this.companyBrandingService = companyBrandingService;
        this.compensationPlanService = compensationPlanService;
        this.paymentConfigService = paymentConfigService;
        this.payoutBankAccountService = payoutBankAccountService;
        this.projectService = projectService;
        this.adminProvisioningService = adminProvisioningService;
        this.rootAssociateProvisioningService = rootAssociateProvisioningService;
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

    private boolean isStepComplete(String key) {
        return switch (key) {
            case "companyProfile" -> companyProfileService.isComplete();
            case "branding" -> companyBrandingService.isComplete();
            case "compensation" -> compensationPlanService.isComplete();
            case "paymentsKyc" -> paymentConfigService.isComplete() && payoutBankAccountService.isComplete();
            case "projects" -> projectService.isComplete();
            case "adminTeam" -> adminProvisioningService.isComplete();
            case "rootAssociates" -> rootAssociateProvisioningService.isComplete();
            case "reviewLaunch" -> isLaunched();
            default -> false;
        };
    }

    private SetupState currentState() {
        return setupStateRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("setup_state row missing - V5 migration seeds it"));
    }

    private record StepDefinition(int number, String key, boolean required) {}
}
