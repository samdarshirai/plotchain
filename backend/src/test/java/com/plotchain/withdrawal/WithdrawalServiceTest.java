package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.payments.WithdrawalConfigResponse;
import com.plotchain.payments.WithdrawalConfigService;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WithdrawalServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock WalletRepository walletRepository;
    @Mock WithdrawalConfigService withdrawalConfigService;
    @Mock WithdrawalRequestRepository withdrawalRequestRepository;
    @Mock SettingsAuditService settingsAuditService;

    WithdrawalService withdrawalService;

    private static final UUID ADMIN_ACTOR_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        withdrawalService = new WithdrawalService(
            associateRepository, walletRepository, withdrawalConfigService,
            withdrawalRequestRepository, settingsAuditService);
    }

    private Associate verifiedActiveAssociate() {
        Associate associate = new Associate();
        associate.setId(ASSOCIATE_ID);
        associate.setUserId("VP00001");
        associate.setName("Jane Doe");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.ACTIVE);
        associate.setKycStatus(KycStatus.VERIFIED);
        return associate;
    }

    private WithdrawalConfigResponse configWith(String approvalMode, BigDecimal autoApproveLimit, BigDecimal minimum) {
        return new WithdrawalConfigResponse(approvalMode, autoApproveLimit, minimum, Instant.now());
    }

    private CreateWithdrawalRequest requestFor(UUID associateId, BigDecimal amount) {
        return new CreateWithdrawalRequest(associateId, amount);
    }

    @Test
    void submitRequestThrowsWhenAssociateIsUnknown() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000")), ADMIN_ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenAssociateIsSuspended() {
        Associate associate = verifiedActiveAssociate();
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000")), ADMIN_ACTOR_ID))
            .isInstanceOf(AssociateSuspendedException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenKycIsNotVerified() {
        Associate associate = verifiedActiveAssociate();
        associate.setKycStatus(KycStatus.PENDING);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000")), ADMIN_ACTOR_ID))
            .isInstanceOf(KycNotVerifiedException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenAmountIsBelowTheConfiguredMinimum() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, new BigDecimal("500.00")));

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("100.00")), ADMIN_ACTOR_ID))
            .isInstanceOf(BelowMinimumWithdrawalException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenWalletBalanceIsInsufficient() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(0);

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000.00")), ADMIN_ACTOR_ID))
            .isInstanceOf(InsufficientWalletBalanceException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void submitRequestCreatesARequestedRowWhenApprovalModeIsAlwaysManual() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("1000.00")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(response.decidedAt()).isNull();
        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Doe");
    }

    @Test
    void submitRequestAutoApprovesWhenApprovalModeIsAutoUnderLimitAndAmountIsAtOrUnderTheLimit() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("AUTO_UNDER_LIMIT", new BigDecimal("5000.00"), BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("5000.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("5000.00")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.APPROVED);
        assertThat(response.decidedAt()).isNotNull();
    }

    @Test
    void submitRequestDoesNotAutoApproveWhenAmountExceedsTheAutoApproveLimit() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("AUTO_UNDER_LIMIT", new BigDecimal("5000.00"), BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("5000.01"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("5000.01")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(response.decidedAt()).isNull();
    }

    @Test
    void submitRequestAllowsAnAssociateWithAdminRoleWithNoSpecialCasing() {
        Associate adminAssociate = verifiedActiveAssociate();
        adminAssociate.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(adminAssociate));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("100.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("100.00")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
    }

    @Test
    void submitRequestRecordsASettingsAuditEntry() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("100.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("100.00")), ADMIN_ACTOR_ID);

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("WITHDRAWAL"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("VP00001");
    }

    private WithdrawalRequest requestFor(UUID id, UUID associateId, BigDecimal amount, WithdrawalRequestStatus status) {
        WithdrawalRequest request = new WithdrawalRequest();
        request.setId(id);
        request.setAssociateId(associateId);
        request.setAmount(amount);
        request.setStatus(status);
        request.setRequestedAt(Instant.now());
        return request;
    }

    // Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Approval queue", Decision 14): same batch-resolved-associate-fields proof as
    // LedgerServiceTest.adminListReturnsAPageMappedToResponsesWithResolvedAssociateAndCycleFields.
    @Test
    void adminListReturnsAPageMappedToResponsesWithBatchResolvedAssociateFields() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        Associate associate = verifiedActiveAssociate();

        when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(ASSOCIATE_ID))).thenReturn(List.of(associate));

        AdminWithdrawalPageResponse response = withdrawalService.adminList(null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.requests()).hasSize(1);
        AdminWithdrawalResponse row = response.requests().get(0);
        assertThat(row.id()).isEqualTo(requestId);
        assertThat(row.associateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(row.associateUserId()).isEqualTo("VP00001");
        assertThat(row.associateName()).isEqualTo("Jane Doe");
        assertThat(row.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(row.amount()).isEqualByComparingTo("1000.00");
    }

    @Test
    void adminListPassesAssociateIdAndStatusFiltersThroughToSearchUnchanged() {
        UUID associateId = UUID.randomUUID();
        when(withdrawalRequestRepository.search(
            eq(associateId), eq(WithdrawalRequestStatus.APPROVED), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        withdrawalService.adminList(associateId, WithdrawalRequestStatus.APPROVED, 0, 20);

        verify(withdrawalRequestRepository).search(
            eq(associateId), eq(WithdrawalRequestStatus.APPROVED), eq(PageRequest.of(0, 20)));
    }

    // Flow "Approval queue" (Decision 14): a batch-lookup miss leaves associateUserId/associateName
    // null instead of failing the whole page -- shouldn't happen under FK integrity, same
    // tolerant-read behavior LedgerService.adminList already has for this exact scenario.
    @Test
    void adminListLeavesAssociateFieldsNullWhenTheBatchLookupMisses() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("100.00"), WithdrawalRequestStatus.REQUESTED);

        when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(ASSOCIATE_ID))).thenReturn(List.of());

        AdminWithdrawalResponse row = withdrawalService.adminList(null, null, 0, 20).requests().get(0);

        assertThat(row.associateUserId()).isNull();
        assertThat(row.associateName()).isNull();
        assertThat(row.id()).isEqualTo(requestId);
    }

    @Test
    void adminListReturnsAnEmptyPageWhenSearchFindsNothing() {
        when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AdminWithdrawalPageResponse response = withdrawalService.adminList(null, null, 0, 20);

        assertThat(response.requests()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }

    // Flow "Own withdrawal history" (Decision 14; unit 9's associate-self equivalent of
    // adminListReturnsAPageMappedToResponsesWithBatchResolvedAssociateFields above): myList
    // reuses the exact same search() call as adminList, but maps to AssociateWithdrawalResponse
    // (no associate-identity fields) and does no associate batch-lookup at all -- every row is
    // always the caller's own, so there's nothing to resolve.
    @Test
    void myListReturnsAPageMappedToResponsesWithNoAssociateIdentityFields() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);

        when(withdrawalRequestRepository.search(eq(ASSOCIATE_ID), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));

        AssociateWithdrawalPageResponse response = withdrawalService.myList(ASSOCIATE_ID, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.requests()).hasSize(1);
        AssociateWithdrawalResponse row = response.requests().get(0);
        assertThat(row.id()).isEqualTo(requestId);
        assertThat(row.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(row.amount()).isEqualByComparingTo("1000.00");
        verifyNoInteractions(associateRepository);
    }

    // Proves associateId is always passed through non-null (the caller's own id) alongside the
    // status filter -- this is the "own requests only" guarantee at the service layer. A
    // different associateId is never accepted as a parameter here at all (the caller-scoping
    // itself is Task 2's controller-layer guarantee); this test only proves the value that does
    // arrive is threaded straight through to search() unchanged.
    @Test
    void myListAlwaysPassesTheCallersAssociateIdAndTheStatusFilterThroughToSearchUnchanged() {
        when(withdrawalRequestRepository.search(
            eq(ASSOCIATE_ID), eq(WithdrawalRequestStatus.DISBURSED), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        withdrawalService.myList(ASSOCIATE_ID, WithdrawalRequestStatus.DISBURSED, 0, 20);

        verify(withdrawalRequestRepository).search(
            eq(ASSOCIATE_ID), eq(WithdrawalRequestStatus.DISBURSED), eq(PageRequest.of(0, 20)));
    }

    @Test
    void myListReturnsAnEmptyPageWhenSearchFindsNothing() {
        when(withdrawalRequestRepository.search(eq(ASSOCIATE_ID), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateWithdrawalPageResponse response = withdrawalService.myList(ASSOCIATE_ID, null, 0, 20);

        assertThat(response.requests()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }

    private WithdrawalDecisionRequest decisionOf(WithdrawalRequestStatus decision, String reason) {
        return new WithdrawalDecisionRequest(decision, reason);
    }

    @Test
    void decideThrowsWhenTheRequestIsUnknown() {
        UUID requestId = UUID.randomUUID();
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(WithdrawalRequestNotFoundException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideApprovesARequestedRequestWithNoBalanceChange() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.decide(
            requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.APPROVED);
        assertThat(response.decidedAt()).isNotNull();
        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void decideThrowsWhenApprovingARequestWhoseAssociateKycHasRegressedSinceSubmission() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        Associate regressed = verifiedActiveAssociate();
        regressed.setKycStatus(KycStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(regressed));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(KycNotVerifiedException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideRejectsARequestedRequestRefundsTheWalletAndSetsTheReason() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("750.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.decide(
            requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Bank details mismatch"), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REJECTED);
        assertThat(response.reason()).isEqualTo("Bank details mismatch");
        assertThat(response.decidedAt()).isNotNull();
        verify(walletRepository).creditBalance(ASSOCIATE_ID, new BigDecimal("750.00"));
    }

    @Test
    void decideCancelsAnApprovedRequestRefundsTheWalletIdenticallyAndProducesTheCancelledAuditMessage() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("2000.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.decide(
            requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Duplicate request"), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REJECTED);
        verify(walletRepository).creditBalance(ASSOCIATE_ID, new BigDecimal("2000.00"));

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("WITHDRAWAL"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("cancelled after approval");
    }

    @Test
    void decideRejectingFromRequestedProducesTheRejectedNotCancelledAuditMessage() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        withdrawalService.decide(requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Not eligible"), ADMIN_ACTOR_ID);

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("WITHDRAWAL"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("rejected").doesNotContain("cancelled");
    }

    @Test
    void decideThrowsWhenRejectingWithABlankReasonFromRequested() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "  "), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(walletRepository, never()).creditBalance(any(), any());
        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenCancellingWithABlankReasonFromApproved() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void decideThrowsWhenTheDecisionValueIsNeitherApprovedNorRejected() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.DISBURSED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsInvalidDecisionNotInvalidStateWhenTheDecisionValueIsGarbageOnAnApprovedRequest() {
        // Regression for a guard-ordering bug: an invalid decision value must always be a 400
        // InvalidWithdrawalDecisionException, even against an APPROVED request that would
        // otherwise 409 for the state-precondition reason -- body validation runs before state
        // checks now, precisely to avoid this request getting the misleading "cannot be
        // re-approved" message when its real problem is the malformed decision value.
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.DISBURSED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenReApprovingAnAlreadyApprovedRequest() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenDecidingAnAlreadyRejectedRequest() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Any reason"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenDecidingAnAlreadyDisbursedRequest() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.DISBURSED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Any reason"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    private DisburseWithdrawalRequest disburseWith(String bankReference) {
        return new DisburseWithdrawalRequest(bankReference);
    }

    @Test
    void disburseThrowsWhenTheRequestIsUnknown() {
        UUID requestId = UUID.randomUUID();
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(WithdrawalRequestNotFoundException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseThrowsWhenTheRequestIsStillRequested() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseThrowsWhenTheRequestIsAlreadyRejected() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseThrowsWhenTheRequestIsAlreadyDisbursed() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.DISBURSED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseTransitionsApprovedToDisbursedRecordsTheBankReferenceAndMakesNoBalanceChange() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.DISBURSED);
        assertThat(response.bankReference()).isEqualTo("BANK-REF-001");
        assertThat(response.disbursedAt()).isNotNull();
        verifyNoInteractions(walletRepository);
    }

    @Test
    void disburseRecordsASettingsAuditEntry() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID);

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("WITHDRAWAL"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("VP00001");
    }
}
