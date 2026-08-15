package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.payments.WithdrawalConfigResponse;
import com.plotchain.payments.WithdrawalConfigService;
import com.plotchain.wallet.WalletRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Submit a withdrawal request"): one service for the withdrawal-request lifecycle
// (Decision 12) -- this unit implements submission only; approve/reject/disburse (units 6-8) are
// added to this same class by later units, not split into separate service classes.
@Service
public class WithdrawalService {

    private final AssociateRepository associateRepository;
    private final WalletRepository walletRepository;
    private final WithdrawalConfigService withdrawalConfigService;
    private final WithdrawalRequestRepository withdrawalRequestRepository;
    private final SettingsAuditService settingsAuditService;

    public WithdrawalService(
            AssociateRepository associateRepository,
            WalletRepository walletRepository,
            WithdrawalConfigService withdrawalConfigService,
            WithdrawalRequestRepository withdrawalRequestRepository,
            SettingsAuditService settingsAuditService) {
        this.associateRepository = associateRepository;
        this.walletRepository = walletRepository;
        this.withdrawalConfigService = withdrawalConfigService;
        this.withdrawalRequestRepository = withdrawalRequestRepository;
        this.settingsAuditService = settingsAuditService;
    }

    // Flow steps 1-10. Guard clauses run in the exact order the spec's flow lists them: unknown
    // associate (404) -> suspended (409) -> KYC unverified (409) -> below minimum (409) ->
    // insufficient balance (409, via the atomic debit itself). @Positive on CreateWithdrawalRequest
    // handles amount <= 0 as a 400 before this method is even called (Bean Validation, not a guard
    // clause here).
    @Transactional
    public AdminWithdrawalResponse submitRequest(CreateWithdrawalRequest request, UUID actorId) {
        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        if (associate.getStatus() == AssociateStatus.SUSPENDED) {
            throw new AssociateSuspendedException(associate.getId());
        }
        if (associate.getKycStatus() != KycStatus.VERIFIED) {
            throw new KycNotVerifiedException(associate.getId());
        }

        WithdrawalConfigResponse config = withdrawalConfigService.getConfig();
        // A null minimumWithdrawalAmount can only occur pre-Go-Live (SetupStateService blocks
        // launch until an admin explicitly sets it, including to exactly 0 -- unit 3, Decision 18);
        // treated as "no minimum" here rather than rejecting every request, since this endpoint has
        // no other way to signal "the platform isn't configured yet" and the spec's own flow
        // assumes the value is always available by the time this runs.
        BigDecimal minimum = config.minimumWithdrawalAmount() == null ? BigDecimal.ZERO : config.minimumWithdrawalAmount();
        if (request.amount().compareTo(minimum) < 0) {
            throw new BelowMinimumWithdrawalException(request.amount(), minimum);
        }

        int debited = walletRepository.debitIfSufficient(associate.getId(), request.amount());
        if (debited == 0) {
            throw new InsufficientWalletBalanceException(associate.getId());
        }

        // Decision 7: auto-approval at request-creation time, the first real use of these
        // long-dead-setting fields. autoApproveLimit is null-checked defensively even though
        // WithdrawalConfigService.validate() already requires it whenever approvalMode is
        // AUTO_UNDER_LIMIT -- this method has no visibility into that invariant holding.
        boolean autoApproved = "AUTO_UNDER_LIMIT".equals(config.approvalMode())
            && config.autoApproveLimit() != null
            && request.amount().compareTo(config.autoApproveLimit()) <= 0;

        Instant now = Instant.now();
        WithdrawalRequest withdrawalRequest = new WithdrawalRequest();
        withdrawalRequest.setId(UUID.randomUUID());
        withdrawalRequest.setAssociateId(associate.getId());
        withdrawalRequest.setAmount(request.amount());
        withdrawalRequest.setStatus(autoApproved ? WithdrawalRequestStatus.APPROVED : WithdrawalRequestStatus.REQUESTED);
        withdrawalRequest.setRequestedAt(now);
        withdrawalRequest.setDecidedAt(autoApproved ? now : null);
        withdrawalRequestRepository.save(withdrawalRequest);

        settingsAuditService.record("withdrawal",
            "Submitted withdrawal for " + associate.getUserId(),
            Map.of("amount", request.amount(), "status", withdrawalRequest.getStatus().name()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }

    private AdminWithdrawalResponse toResponse(WithdrawalRequest withdrawalRequest, Associate associate) {
        return new AdminWithdrawalResponse(
            withdrawalRequest.getId(),
            withdrawalRequest.getAssociateId(),
            associate.getUserId(),
            associate.getName(),
            withdrawalRequest.getAmount(),
            withdrawalRequest.getStatus(),
            withdrawalRequest.getReason(),
            withdrawalRequest.getBankReference(),
            withdrawalRequest.getRequestedAt(),
            withdrawalRequest.getDecidedAt(),
            withdrawalRequest.getDisbursedAt());
    }
}
