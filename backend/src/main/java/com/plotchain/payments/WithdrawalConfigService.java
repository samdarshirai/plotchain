package com.plotchain.payments;

import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class WithdrawalConfigService {

    private final WithdrawalConfigRepository withdrawalConfigRepository;
    private final SettingsAuditService settingsAuditService;

    public WithdrawalConfigService(WithdrawalConfigRepository withdrawalConfigRepository,
                                    SettingsAuditService settingsAuditService) {
        this.withdrawalConfigRepository = withdrawalConfigRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public WithdrawalConfigResponse getConfig() {
        return toResponse(currentConfig());
    }

    public WithdrawalConfigResponse updateConfig(WithdrawalConfigRequest request, UUID actorId) {
        validate(request);
        WithdrawalConfig config = currentConfig();
        WithdrawalConfigResponse before = toResponse(config);
        config.setApprovalMode(request.approvalMode());
        // ALWAYS_MANUAL ignores the limit entirely -- cleared rather than left stale, so a
        // later switch back to AUTO_UNDER_LIMIT can't silently resurrect an old value.
        config.setAutoApproveLimit("ALWAYS_MANUAL".equals(request.approvalMode()) ? null : request.autoApproveLimit());
        config.setMinimumWithdrawalAmount(request.minimumWithdrawalAmount());
        config.setUpdatedAt(Instant.now());
        withdrawalConfigRepository.save(config);
        WithdrawalConfigResponse after = toResponse(config);
        settingsAuditService.record("PAYMENTS_KYC", "Updated withdrawal approval settings",
            Map.of("before", before, "after", after), actorId);
        return after;
    }

    // Go-Live-gating field (Decisions 6 and 18, wallet-withdrawal spec) -- matches
    // PayoutBankAccountService.isComplete()'s exact pattern, a null-check instead of a
    // blank-string check since this field is numeric. false while never set (the fresh
    // V9-seeded row's state); true once set, including to exactly 0 -- an explicit "no
    // minimum" is still a completed configuration, distinct from never having been set.
    public boolean isComplete() {
        return currentConfig().getMinimumWithdrawalAmount() != null;
    }

    // Cross-field rule, not expressible as a single-field Bean Validation annotation -- same
    // category as compensation's reward-tier contiguity check.
    private void validate(WithdrawalConfigRequest request) {
        if ("AUTO_UNDER_LIMIT".equals(request.approvalMode())
                && (request.autoApproveLimit() == null || request.autoApproveLimit().compareTo(BigDecimal.ZERO) <= 0)) {
            throw new InvalidWithdrawalConfigException(
                "auto-approve limit must be a positive amount when approval mode is AUTO_UNDER_LIMIT");
        }
    }

    private WithdrawalConfig currentConfig() {
        return withdrawalConfigRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("withdrawal_config row missing - V9 migration seeds it"));
    }

    private static WithdrawalConfigResponse toResponse(WithdrawalConfig config) {
        return new WithdrawalConfigResponse(
            config.getApprovalMode(),
            config.getAutoApproveLimit(),
            config.getMinimumWithdrawalAmount(),
            config.getUpdatedAt()
        );
    }
}
