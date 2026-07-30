package com.plotchain.payments;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

@Service
public class PaymentConfigService {

    private final PaymentConfigRepository paymentConfigRepository;
    private final SecretsEncryptionService secretsEncryptionService;

    public PaymentConfigService(PaymentConfigRepository paymentConfigRepository,
                                 SecretsEncryptionService secretsEncryptionService) {
        this.paymentConfigRepository = paymentConfigRepository;
        this.secretsEncryptionService = secretsEncryptionService;
    }

    public PaymentConfigResponse getConfig() {
        return toResponse(currentConfig());
    }

    public PaymentConfigResponse updateConfig(PaymentConfigRequest request) {
        PaymentConfig config = currentConfig();
        config.setGateway(request.gateway());
        config.setModesEnabled(joinModes(request.modesEnabled()));
        // Blank/absent credentials leave the previously stored ciphertext untouched -- see
        // PaymentConfigRequest.credentials' javadoc for why.
        if (request.credentials() != null && !request.credentials().isBlank()) {
            config.setCredentialsEncrypted(secretsEncryptionService.encrypt(request.credentials()));
        }
        config.setUpdatedAt(Instant.now());
        paymentConfigRepository.save(config);
        return toResponse(config);
    }

    // Gateway selection alone isn't "a way to collect money" -- credentials must actually be
    // configured too. Matches the spec's Step 5 gating language ("cannot go live without a way
    // to collect money or pay associates").
    public boolean isComplete() {
        PaymentConfig config = currentConfig();
        return config.getGateway() != null && !config.getGateway().isBlank()
            && config.getCredentialsEncrypted() != null;
    }

    private PaymentConfig currentConfig() {
        return paymentConfigRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("payment_config row missing - V9 migration seeds it"));
    }

    private static String joinModes(List<String> modes) {
        return modes == null || modes.isEmpty() ? null : String.join(",", modes);
    }

    private static List<String> splitModes(String modes) {
        return modes == null || modes.isBlank() ? List.of() : Arrays.asList(modes.split(","));
    }

    private static PaymentConfigResponse toResponse(PaymentConfig config) {
        return new PaymentConfigResponse(
            config.getGateway(),
            config.getCredentialsEncrypted() != null,
            splitModes(config.getModesEnabled()),
            config.getUpdatedAt()
        );
    }
}
