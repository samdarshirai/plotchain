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
        verify(settingsAuditService).record(eq("withdrawal"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
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
}
