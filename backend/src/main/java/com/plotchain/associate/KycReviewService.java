package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.wallet.WalletCreditingService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class KycReviewService {

    private final AssociateRepository associateRepository;
    private final SettingsAuditService settingsAuditService;
    private final WalletCreditingService walletCreditingService;

    public KycReviewService(AssociateRepository associateRepository, SettingsAuditService settingsAuditService,
                             WalletCreditingService walletCreditingService) {
        this.associateRepository = associateRepository;
        this.settingsAuditService = settingsAuditService;
        this.walletCreditingService = walletCreditingService;
    }

    public KycPageResponse list(KycStatus status, int page, int size) {
        Page<Associate> result = associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, status, PageRequest.of(page, size));
        List<KycQueueEntryResponse> entries = result.getContent().stream().map(KycReviewService::toEntry).toList();
        return new KycPageResponse(entries, page, size, result.getTotalElements());
    }

    @Transactional
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

        // Wallet/withdrawal unit 4 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
        // Decision 16): a VERIFIED decision triggers the reconciliation sweep for any
        // CARRIED_FORWARD entries this associate has withheld across any past cycle -- no sweep
        // on REJECTED. Cross-package call from associate into wallet, the first one in this
        // direction in the codebase, structurally no different from the many services that
        // already call settingsAuditService. Does not affect this method's return value or
        // transaction outcome beyond the sweep's own wallet/ledger-entry writes, which run inside
        // this same @Transactional method.
        if (request.decision() == KycStatus.VERIFIED) {
            walletCreditingService.reconcileCarriedForward(associate.getId(), associate.getUserId(), actorId);
        }

        return toEntry(associate);
    }

    public KycCountsResponse counts() {
        return new KycCountsResponse(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );
    }

    private static KycQueueEntryResponse toEntry(Associate a) {
        return new KycQueueEntryResponse(a.getId(), a.getUserId(), a.getName(), a.getKycStatus(), a.getJoinedAt());
    }
}
