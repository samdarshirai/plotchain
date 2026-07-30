package com.plotchain.payments;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/company/kyc")
public class KycConfigController {

    private final KycConfigService kycConfigService;

    public KycConfigController(KycConfigService kycConfigService) {
        this.kycConfigService = kycConfigService;
    }

    @GetMapping
    public KycConfigResponse getConfig() {
        return kycConfigService.getConfig();
    }

    @PutMapping
    public KycConfigResponse updateConfig(@Valid @RequestBody KycConfigRequest request) {
        return kycConfigService.updateConfig(request);
    }
}
