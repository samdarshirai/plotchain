package com.plotchain.payments;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

@Service
public class KycConfigService {

    private final KycConfigRepository kycConfigRepository;

    public KycConfigService(KycConfigRepository kycConfigRepository) {
        this.kycConfigRepository = kycConfigRepository;
    }

    public KycConfigResponse getConfig() {
        return toResponse(currentConfig());
    }

    public KycConfigResponse updateConfig(KycConfigRequest request) {
        KycConfig config = currentConfig();
        config.setStrictness(request.strictness());
        config.setRequiredDocuments(joinDocuments(request.requiredDocuments()));
        config.setUpdatedAt(Instant.now());
        kycConfigRepository.save(config);
        return toResponse(config);
    }

    // Not part of SetupStateService's paymentsKyc predicate -- the seeded default (STRICT,
    // AADHAAR/PAN/BANK_PASSBOOK) is always a usable, complete policy, so this never blocks Go
    // Live. See the phase plan's decision 4.

    private KycConfig currentConfig() {
        return kycConfigRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("kyc_config row missing - V9 migration seeds it"));
    }

    private static String joinDocuments(List<String> documents) {
        return documents == null || documents.isEmpty() ? null : String.join(",", documents);
    }

    private static List<String> splitDocuments(String documents) {
        return documents == null || documents.isBlank() ? List.of() : Arrays.asList(documents.split(","));
    }

    private static KycConfigResponse toResponse(KycConfig config) {
        return new KycConfigResponse(
            config.getStrictness(),
            splitDocuments(config.getRequiredDocuments()),
            config.getUpdatedAt()
        );
    }
}
