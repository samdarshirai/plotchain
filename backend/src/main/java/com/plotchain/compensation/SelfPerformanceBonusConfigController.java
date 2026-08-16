package com.plotchain.compensation;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/self-performance-bonus")
public class SelfPerformanceBonusConfigController {

    private final SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;

    public SelfPerformanceBonusConfigController(SelfPerformanceBonusConfigService selfPerformanceBonusConfigService) {
        this.selfPerformanceBonusConfigService = selfPerformanceBonusConfigService;
    }

    @GetMapping
    public SelfPerformanceBonusConfigResponse getConfig() {
        return selfPerformanceBonusConfigService.getConfig();
    }

    @PutMapping
    public SelfPerformanceBonusConfigResponse updateConfig(
            @Valid @RequestBody SelfPerformanceBonusConfigRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return selfPerformanceBonusConfigService.updateConfig(request, actorId);
    }
}
