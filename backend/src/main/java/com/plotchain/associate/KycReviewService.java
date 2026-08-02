package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class KycReviewService {

    private final AssociateRepository associateRepository;
    private final SettingsAuditService settingsAuditService;

    public KycReviewService(AssociateRepository associateRepository, SettingsAuditService settingsAuditService) {
        this.associateRepository = associateRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public KycPageResponse list(KycStatus status, int page, int size) {
        Page<Associate> result = associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, status, PageRequest.of(page, size));
        List<KycQueueEntryResponse> entries = result.getContent().stream().map(KycReviewService::toEntry).toList();
        return new KycPageResponse(entries, page, size, result.getTotalElements());
    }

    public KycQueueEntryResponse decide(UUID associateId, KycDecisionRequest request, UUID actorId) {
        // Look up the associate before validating the decision body, matching the
        // findOrThrow-first pattern used by AdminAssociateService.suspend/reactivate/
        // resetPassword: an unknown associateId should surface as AssociateNotFoundException
        // regardless of what the (possibly also invalid) request body contains.
        Associate associate = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (request.decision() != KycStatus.VERIFIED && request.decision() != KycStatus.REJECTED) {
            throw new InvalidKycDecisionException("decision must be VERIFIED or REJECTED");
        }
        if (request.decision() == KycStatus.REJECTED && (request.reason() == null || request.reason().isBlank())) {
            throw new InvalidKycDecisionException("reason is required when rejecting");
        }

        associate.setKycStatus(request.decision());
        associateRepository.save(associate);

        settingsAuditService.record("kyc",
            "KYC " + request.decision().name() + " for " + associate.getUserId(),
            Map.of("decision", request.decision().name(), "reason", request.reason() == null ? "" : request.reason()),
            actorId);

        return toEntry(associate);
    }

    private static KycQueueEntryResponse toEntry(Associate a) {
        return new KycQueueEntryResponse(a.getId(), a.getUserId(), a.getName(), a.getKycStatus(), a.getJoinedAt());
    }
}
