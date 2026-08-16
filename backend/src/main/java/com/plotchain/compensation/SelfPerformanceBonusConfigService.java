package com.plotchain.compensation;

import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class SelfPerformanceBonusConfigService {

    private final SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;
    private final SettingsAuditService settingsAuditService;

    public SelfPerformanceBonusConfigService(
            SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository,
            SettingsAuditService settingsAuditService) {
        this.selfPerformanceBonusConfigRepository = selfPerformanceBonusConfigRepository;
        this.settingsAuditService = settingsAuditService;
    }

    // Narrow public surface for other domains (SaleService) to consume -- currentConfig() itself
    // stays private, same pattern as WithdrawalConfigService.isComplete().
    public boolean isEnabled() {
        return currentConfig().isEnabled();
    }

    public SelfPerformanceBonusConfigResponse getConfig() {
        return toResponse(currentConfig());
    }

    public SelfPerformanceBonusConfigResponse updateConfig(SelfPerformanceBonusConfigRequest request, UUID actorId) {
        SelfPerformanceBonusConfig config = currentConfig();
        SelfPerformanceBonusConfigResponse before = toResponse(config);
        config.setEnabled(request.enabled());
        config.setUpdatedAt(Instant.now());
        selfPerformanceBonusConfigRepository.save(config);
        SelfPerformanceBonusConfigResponse after = toResponse(config);
        settingsAuditService.record("COMPENSATION", "Updated self-performance bonus enabled flag",
            Map.of("before", before, "after", after), actorId);
        return after;
    }

    private SelfPerformanceBonusConfig currentConfig() {
        return selfPerformanceBonusConfigRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException(
                "self_performance_bonus_config row missing - V25 migration seeds it"));
    }

    private static SelfPerformanceBonusConfigResponse toResponse(SelfPerformanceBonusConfig config) {
        return new SelfPerformanceBonusConfigResponse(config.isEnabled(), config.getUpdatedAt());
    }
}
