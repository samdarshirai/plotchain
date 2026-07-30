package com.plotchain.payments;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/company/withdrawal")
public class WithdrawalConfigController {

    private final WithdrawalConfigService withdrawalConfigService;

    public WithdrawalConfigController(WithdrawalConfigService withdrawalConfigService) {
        this.withdrawalConfigService = withdrawalConfigService;
    }

    @GetMapping
    public WithdrawalConfigResponse getConfig() {
        return withdrawalConfigService.getConfig();
    }

    @PutMapping
    public WithdrawalConfigResponse updateConfig(@Valid @RequestBody WithdrawalConfigRequest request) {
        return withdrawalConfigService.updateConfig(request);
    }
}
