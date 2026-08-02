package com.plotchain.payments;

import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class BookingEmiConfigService {

    private final BookingEmiConfigRepository bookingEmiConfigRepository;
    private final SettingsAuditService settingsAuditService;

    public BookingEmiConfigService(BookingEmiConfigRepository bookingEmiConfigRepository,
                                    SettingsAuditService settingsAuditService) {
        this.bookingEmiConfigRepository = bookingEmiConfigRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public BookingEmiConfigResponse getConfig() {
        return toResponse(currentConfig());
    }

    public BookingEmiConfigResponse updateConfig(BookingEmiConfigRequest request, UUID actorId) {
        validate(request);
        BookingEmiConfig config = currentConfig();
        BookingEmiConfigResponse before = toResponse(config);
        config.setEmiEnabled(request.emiEnabled());
        config.setDefaultInstallmentCount(request.defaultInstallmentCount());
        config.setConfirmRule(request.confirmRule());
        // Only AUTO_THRESHOLD uses a threshold -- cleared rather than left stale, so a later
        // switch back to AUTO_THRESHOLD can't silently resurrect an old value.
        config.setConfirmThresholdPercent(
            "AUTO_THRESHOLD".equals(request.confirmRule()) ? request.confirmThresholdPercent() : null);
        config.setUpdatedAt(Instant.now());
        bookingEmiConfigRepository.save(config);
        BookingEmiConfigResponse after = toResponse(config);
        settingsAuditService.record("PAYMENTS_KYC", "Updated booking & EMI policy settings",
            Map.of("before", before, "after", after), actorId);
        return after;
    }

    // Cross-field rule, not expressible as a single-field Bean Validation annotation -- same
    // category as withdrawal's auto-approve limit check.
    private void validate(BookingEmiConfigRequest request) {
        if ("AUTO_THRESHOLD".equals(request.confirmRule())
                && (request.confirmThresholdPercent() == null || request.confirmThresholdPercent() <= 0)) {
            throw new InvalidBookingEmiConfigException(
                "confirm threshold percent must be a positive value when confirm rule is AUTO_THRESHOLD");
        }
    }

    private BookingEmiConfig currentConfig() {
        return bookingEmiConfigRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("booking_emi_config row missing - V14 migration seeds it"));
    }

    private static BookingEmiConfigResponse toResponse(BookingEmiConfig config) {
        return new BookingEmiConfigResponse(
            config.isEmiEnabled(),
            config.getDefaultInstallmentCount(),
            config.getConfirmRule(),
            config.getConfirmThresholdPercent(),
            config.getUpdatedAt()
        );
    }
}
