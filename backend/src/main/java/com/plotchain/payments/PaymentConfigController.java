package com.plotchain.payments;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/payments")
public class PaymentConfigController {

    private final PaymentConfigService paymentConfigService;

    public PaymentConfigController(PaymentConfigService paymentConfigService) {
        this.paymentConfigService = paymentConfigService;
    }

    @GetMapping
    public PaymentConfigResponse getConfig() {
        return paymentConfigService.getConfig();
    }

    @PutMapping
    public PaymentConfigResponse updateConfig(
            @Valid @RequestBody PaymentConfigRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return paymentConfigService.updateConfig(request, actorId);
    }
}
