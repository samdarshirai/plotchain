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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

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

        settingsAuditService.record("WITHDRAWAL",
            "Submitted withdrawal for " + associate.getUserId(),
            Map.of("amount", request.amount(), "status", withdrawalRequest.getStatus().name()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }

    // Flow "Approval queue" (Decision 14): full cross-associate visibility, batch-resolving
    // associate identity once per page -- same pattern as LedgerService.adminList. Method name
    // mirrors LedgerService.adminList deliberately, so a future WithdrawalService.myWithdrawals(...)
    // (unit 9) reads as its obvious sibling and can reuse this same search() call, passing the
    // caller's own id as associateId instead of the admin-supplied filter.
    public AdminWithdrawalPageResponse adminList(UUID associateId, WithdrawalRequestStatus status, int page, int size) {
        Page<WithdrawalRequest> result = withdrawalRequestRepository.search(
            associateId, status, PageRequest.of(page, size));

        List<WithdrawalRequest> content = result.getContent();
        Map<UUID, Associate> associatesById = associatesById(content);

        List<AdminWithdrawalResponse> rows = content.stream()
            .map(r -> toResponse(r, associatesById.get(r.getAssociateId())))
            .toList();
        return new AdminWithdrawalPageResponse(rows, page, size, result.getTotalElements());
    }

    // Flow "Decide" (Decision 17, post-review broadening of the precondition from "must be
    // REQUESTED"): approve/reject a REQUESTED request, or cancel (reject) an already-APPROVED
    // one, through this single method -- no separate "cancel" endpoint or status value. Guard
    // order: 404 (unknown id) -> 400 (malformed decision body, InvalidWithdrawalDecisionException
    // -- checked before the state guards below so a request with an invalid decision value always
    // gets the body-validation error, regardless of the target's current status; the spec's Flow
    // steps don't mandate state-before-body, and this ordering avoids a misleading 409 "cannot be
    // re-approved" message on a request whose real problem is an invalid decision value) -> 409
    // (state precondition, Decision 17) -> 409 (KYC regression, only on the APPROVED path,
    // Decision 9) -> mutate -> save -> audit.
    @Transactional
    public AdminWithdrawalResponse decide(UUID id, WithdrawalDecisionRequest request, UUID actorId) {
        WithdrawalRequest withdrawalRequest = withdrawalRequestRepository.findById(id)
            .orElseThrow(() -> new WithdrawalRequestNotFoundException(id));

        WithdrawalRequestStatus priorStatus = withdrawalRequest.getStatus();

        if (request.decision() != WithdrawalRequestStatus.APPROVED && request.decision() != WithdrawalRequestStatus.REJECTED) {
            throw new InvalidWithdrawalDecisionException("decision must be APPROVED or REJECTED");
        }
        if (request.decision() == WithdrawalRequestStatus.REJECTED
                && (request.reason() == null || request.reason().isBlank())) {
            throw new InvalidWithdrawalDecisionException("reason is required when rejecting");
        }

        // Decision 17: REJECTED/DISBURSED never accept a decision. APPROVED accepts only
        // REJECTED (a cancel) -- re-approving is meaningless. REQUESTED accepts both, already
        // confirmed valid by the decision-value guard above.
        if (priorStatus == WithdrawalRequestStatus.REJECTED || priorStatus == WithdrawalRequestStatus.DISBURSED) {
            throw new InvalidWithdrawalStateException(
                "Withdrawal request " + id + " is already " + priorStatus + " and cannot be decided again");
        }
        if (priorStatus == WithdrawalRequestStatus.APPROVED && request.decision() != WithdrawalRequestStatus.REJECTED) {
            throw new InvalidWithdrawalStateException(
                "An APPROVED withdrawal request can only be cancelled (rejected), not re-approved");
        }

        Associate associate = associateRepository.findById(withdrawalRequest.getAssociateId())
            .orElseThrow(() -> new AssociateNotFoundException(withdrawalRequest.getAssociateId()));

        Instant now = Instant.now();
        String summary;
        if (request.decision() == WithdrawalRequestStatus.APPROVED) {
            // Only reachable when priorStatus == REQUESTED, per the guards above.
            if (associate.getKycStatus() != KycStatus.VERIFIED) {
                throw new KycNotVerifiedException(associate.getId());
            }
            withdrawalRequest.setStatus(WithdrawalRequestStatus.APPROVED);
            withdrawalRequest.setDecidedAt(now);
            summary = "Withdrawal approved for " + associate.getUserId();
        } else {
            // Reachable from REQUESTED (a plain reject) or APPROVED (a post-approval cancel) --
            // same refund call either way (Decision 10), audit message text is what
            // distinguishes them (Decision 17).
            walletRepository.creditBalance(withdrawalRequest.getAssociateId(), withdrawalRequest.getAmount());
            withdrawalRequest.setStatus(WithdrawalRequestStatus.REJECTED);
            withdrawalRequest.setReason(request.reason());
            withdrawalRequest.setDecidedAt(now);
            summary = priorStatus == WithdrawalRequestStatus.APPROVED
                ? "Withdrawal cancelled after approval for " + associate.getUserId()
                : "Withdrawal rejected for " + associate.getUserId();
        }

        withdrawalRequestRepository.save(withdrawalRequest);

        settingsAuditService.record("WITHDRAWAL", summary,
            Map.of("decision", request.decision().name(),
                   "reason", request.reason() == null ? "" : request.reason(),
                   "priorStatus", priorStatus.name()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }

    // Flow "Disburse" (Decision 10): the simplest of the four withdrawal-lifecycle transitions --
    // exactly one valid prior state (APPROVED), no branching, no refund, and no wallet mutation
    // at all -- the associate's balance was already debited at submission time (unit 5) and is
    // never touched again by approve (unit 7) or here. This method only ever writes the three
    // disbursement-record fields: status, bankReference, disbursedAt. bankReference's
    // blank-check is handled entirely by @NotBlank on DisburseWithdrawalRequest (Bean
    // Validation, before this method runs), the same division of labor CreateWithdrawalRequest's
    // @Positive amount already establishes. Reuses WithdrawalRequestNotFoundException and
    // InvalidWithdrawalStateException unmodified from unit 7 -- both already mapped by
    // WithdrawalExceptionHandler, so no handler changes are needed here.
    @Transactional
    public AdminWithdrawalResponse disburse(UUID id, DisburseWithdrawalRequest request, UUID actorId) {
        WithdrawalRequest withdrawalRequest = withdrawalRequestRepository.findById(id)
            .orElseThrow(() -> new WithdrawalRequestNotFoundException(id));

        if (withdrawalRequest.getStatus() != WithdrawalRequestStatus.APPROVED) {
            throw new InvalidWithdrawalStateException(
                "Withdrawal request " + id + " is " + withdrawalRequest.getStatus()
                    + " and cannot be disbursed; only an APPROVED request can be disbursed");
        }

        Associate associate = associateRepository.findById(withdrawalRequest.getAssociateId())
            .orElseThrow(() -> new AssociateNotFoundException(withdrawalRequest.getAssociateId()));

        withdrawalRequest.setStatus(WithdrawalRequestStatus.DISBURSED);
        withdrawalRequest.setBankReference(request.bankReference());
        withdrawalRequest.setDisbursedAt(Instant.now());
        withdrawalRequestRepository.save(withdrawalRequest);

        settingsAuditService.record("WITHDRAWAL",
            "Withdrawal disbursed for " + associate.getUserId(),
            Map.of("bankReference", request.bankReference()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }

    // Flow "Own withdrawal history" (Decision 14): associateId is always the caller's own id,
    // supplied by AssociateWithdrawalController from @AuthenticationPrincipal -- never null,
    // never taken from a request parameter. Reuses the exact same search() call as adminList()
    // above, passing the caller's id where that method passes the admin-supplied filter -- no
    // new repository method, per unit 6's forward-compatibility note on
    // WithdrawalRequestRepository.search. No associate batch-lookup here at all: every row
    // belongs to the caller, so there's nothing to resolve (unlike adminList, which needs
    // associatesById() for cross-associate rows).
    public AssociateWithdrawalPageResponse myList(UUID associateId, WithdrawalRequestStatus status, int page, int size) {
        Page<WithdrawalRequest> result = withdrawalRequestRepository.search(
            associateId, status, PageRequest.of(page, size));

        List<AssociateWithdrawalResponse> rows = result.getContent().stream()
            .map(this::toAssociateResponse)
            .toList();
        return new AssociateWithdrawalPageResponse(rows, page, size, result.getTotalElements());
    }

    private Map<UUID, Associate> associatesById(List<WithdrawalRequest> requests) {
        List<UUID> distinctAssociateIds = requests.stream().map(WithdrawalRequest::getAssociateId).distinct().toList();
        return associateRepository.findAllById(distinctAssociateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
    }

    private AdminWithdrawalResponse toResponse(WithdrawalRequest withdrawalRequest, Associate associate) {
        return new AdminWithdrawalResponse(
            withdrawalRequest.getId(),
            withdrawalRequest.getAssociateId(),
            associate == null ? null : associate.getUserId(),
            associate == null ? null : associate.getName(),
            withdrawalRequest.getAmount(),
            withdrawalRequest.getStatus(),
            withdrawalRequest.getReason(),
            withdrawalRequest.getBankReference(),
            withdrawalRequest.getRequestedAt(),
            withdrawalRequest.getDecidedAt(),
            withdrawalRequest.getDisbursedAt());
    }

    private AssociateWithdrawalResponse toAssociateResponse(WithdrawalRequest withdrawalRequest) {
        return new AssociateWithdrawalResponse(
            withdrawalRequest.getId(),
            withdrawalRequest.getAmount(),
            withdrawalRequest.getStatus(),
            withdrawalRequest.getReason(),
            withdrawalRequest.getBankReference(),
            withdrawalRequest.getRequestedAt(),
            withdrawalRequest.getDecidedAt(),
            withdrawalRequest.getDisbursedAt());
    }
}
