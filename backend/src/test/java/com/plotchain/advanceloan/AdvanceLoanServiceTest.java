package com.plotchain.advanceloan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.expense.PayMode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdvanceLoanServiceTest {

    @Mock AdvanceLoanRepository loans;
    @Mock LoanRepaymentRepository repayments;
    @Mock AssociateRepository associates;
    @Mock SettingsAuditLogRepository auditLogRepository;

    AdvanceLoanService service;
    UUID associateId = UUID.randomUUID();
    Associate associate;

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associates, new ObjectMapper().findAndRegisterModules());
        service = new AdvanceLoanService(loans, repayments, associates, audit);
        associate = new Associate();
        associate.setId(associateId);
        associate.setUserId("VP00001");
        associate.setName("Asha");
        associate.setPhone("9999999999");
    }

    private AdvanceLoanRequest loanRequest(String amount) {
        return new AdvanceLoanRequest(associateId, LocalDate.of(2026, 10, 1), new BigDecimal(amount), PayMode.CASH, null, null, null);
    }

    private AdvanceLoan loan(String amount) {
        return new AdvanceLoan(UUID.randomUUID(), associateId, LocalDate.of(2026, 10, 1), new BigDecimal(amount),
            BigDecimal.ZERO, PayMode.CASH, null, null, null);
    }

    private RepaymentRequest repayRequest(String amount) {
        return new RepaymentRequest(LocalDate.of(2026, 10, 2), new BigDecimal(amount), PayMode.UPI, "HDFC", "TXN1");
    }

    @Test
    void createSnapshotsPreviousDuesExcludingNewLoan() {
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        when(loans.sumAmountByAssociate(associateId)).thenReturn(new BigDecimal("1000.00"));
        when(repayments.sumAmountByAssociate(associateId)).thenReturn(new BigDecimal("300.00"));
        AdvanceLoanResponse r = service.create(loanRequest("500"), UUID.randomUUID());
        assertThat(r.previousDues()).isEqualByComparingTo("700.00");
        assertThat(r.outstanding()).isEqualByComparingTo("500");
        ArgumentCaptor<AdvanceLoan> saved = ArgumentCaptor.forClass(AdvanceLoan.class);
        verify(loans).save(saved.capture());
        assertThat(saved.getValue().getPreviousDues()).isEqualByComparingTo("700.00");
    }

    @Test
    void createRejectsUnknownAssociate() {
        when(associates.findById(associateId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(loanRequest("5"), UUID.randomUUID())).isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void createRejectsMoreThanTwoDecimals() {
        assertThatThrownBy(() -> service.create(loanRequest("5.001"), UUID.randomUUID())).isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void duesIsZeroWhenAssociateHasNoLoans() {
        when(loans.sumAmountByAssociate(associateId)).thenReturn(BigDecimal.ZERO);
        when(repayments.sumAmountByAssociate(associateId)).thenReturn(BigDecimal.ZERO);
        assertThat(service.dues(associateId).outstanding()).isEqualByComparingTo("0");
    }

    @Test
    void repayLocksLoanAndAssignsReceiptNumber() {
        AdvanceLoan l = loan("1000");
        when(loans.findByIdForUpdate(l.getId())).thenReturn(Optional.of(l));
        when(repayments.sumAmountByLoan(l.getId())).thenReturn(new BigDecimal("400"));
        when(repayments.nextReceiptNumber()).thenReturn(123L);
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        LoanRepaymentResponse r = service.repay(l.getId(), repayRequest("600"), UUID.randomUUID());
        assertThat(r.receiptNo()).isEqualTo("RCP-000123");
        assertThat(r.associateUserId()).isEqualTo("VP00001");
        verify(loans).findByIdForUpdate(l.getId());
        verify(repayments).save(any(LoanRepayment.class));
    }

    @Test
    void repayRejectsOneCentOverRemaining() {
        AdvanceLoan l = loan("1000");
        when(loans.findByIdForUpdate(l.getId())).thenReturn(Optional.of(l));
        when(repayments.sumAmountByLoan(l.getId())).thenReturn(new BigDecimal("400"));
        assertThatThrownBy(() -> service.repay(l.getId(), repayRequest("600.01"), UUID.randomUUID()))
            .isInstanceOf(AdvanceLoanException.class).hasMessageContaining("remaining");
    }

    @Test
    void repayRejectsUnknownLoan() {
        UUID id = UUID.randomUUID();
        when(loans.findByIdForUpdate(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.repay(id, repayRequest("1"), UUID.randomUUID())).isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void repaymentsRejectFromAfterTo() {
        assertThatThrownBy(() -> service.repayments(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1), null))
            .isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void repayTrimsBankNameAndNullsBlankTxnNo() {
        AdvanceLoan l = loan("1000");
        when(loans.findByIdForUpdate(l.getId())).thenReturn(Optional.of(l));
        when(repayments.sumAmountByLoan(l.getId())).thenReturn(BigDecimal.ZERO);
        when(repayments.nextReceiptNumber()).thenReturn(1L);
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        service.repay(l.getId(), new RepaymentRequest(LocalDate.of(2026, 10, 2), new BigDecimal("5"), PayMode.UPI, " HDFC ", "   "),
            UUID.randomUUID());
        ArgumentCaptor<LoanRepayment> saved = ArgumentCaptor.forClass(LoanRepayment.class);
        verify(repayments).save(saved.capture());
        assertThat(saved.getValue().getBankName()).isEqualTo("HDFC");
        assertThat(saved.getValue().getTxnNo()).isNull();
    }

    @Test
    void createTrimsBankNameAndNullsBlankInstrumentNo() {
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        when(loans.sumAmountByAssociate(associateId)).thenReturn(BigDecimal.ZERO);
        when(repayments.sumAmountByAssociate(associateId)).thenReturn(BigDecimal.ZERO);
        service.create(new AdvanceLoanRequest(associateId, LocalDate.of(2026, 10, 1), new BigDecimal("5"), PayMode.CASH, " X ", " ", null),
            UUID.randomUUID());
        ArgumentCaptor<AdvanceLoan> saved = ArgumentCaptor.forClass(AdvanceLoan.class);
        verify(loans).save(saved.capture());
        assertThat(saved.getValue().getBankName()).isEqualTo("X");
        assertThat(saved.getValue().getInstrumentNo()).isNull();
    }

    @Test
    void repayRejectsThreeDecimalsWithBadRequest() {
        assertThatThrownBy(() -> service.repay(UUID.randomUUID(), repayRequest("10.005"), UUID.randomUUID()))
            .isInstanceOfSatisfying(AdvanceLoanException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void repayOverRemainingIsConflict() {
        AdvanceLoan l = loan("1000");
        when(loans.findByIdForUpdate(l.getId())).thenReturn(Optional.of(l));
        when(repayments.sumAmountByLoan(l.getId())).thenReturn(new BigDecimal("400"));
        assertThatThrownBy(() -> service.repay(l.getId(), repayRequest("600.01"), UUID.randomUUID()))
            .isInstanceOfSatisfying(AdvanceLoanException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void repayUnknownLoanIsNotFound() {
        UUID id = UUID.randomUUID();
        when(loans.findByIdForUpdate(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.repay(id, repayRequest("1"), UUID.randomUUID()))
            .isInstanceOfSatisfying(AdvanceLoanException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void likePatternEscapesUnderscoreAndBackslashAndBlank() {
        assertThat(AdvanceLoanService.likePattern("a_b")).isEqualTo("%a\\_b%");
        assertThat(AdvanceLoanService.likePattern("a\\b")).isEqualTo("%a\\\\b%");
        assertThat(AdvanceLoanService.likePattern("  ")).isEqualTo("%");
    }

    @Test
    void repaymentsEscapeLikeWildcardsInSearch() {
        when(repayments.search(any(), any(), eq("%\\%%"))).thenReturn(List.of());
        service.repayments(null, null, "%");
        verify(repayments).search(any(), any(), eq("%\\%%"));
    }

    private LoanRepayment repayment(UUID loanId, String amount) {
        return new LoanRepayment(UUID.randomUUID(), loanId, "RCP-000001", LocalDate.of(2026, 10, 2), new BigDecimal(amount),
            PayMode.UPI, null, null);
    }

    @Test
    void detailComputesRepaidKeepsRepositoryOrderAndPhone() {
        AdvanceLoan l = loan("1000.00");
        LoanRepayment newer = repayment(l.getId(), "400.00");
        LoanRepayment older = repayment(l.getId(), "100.00");
        when(loans.findById(l.getId())).thenReturn(Optional.of(l));
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        when(repayments.findByLoanIdOrderByPaymentDateDescCreatedAtDesc(l.getId())).thenReturn(List.of(newer, older));
        AdvanceLoanDetailResponse d = service.detail(l.getId());
        assertThat(d.loan().repaid()).isEqualByComparingTo("500.00");
        assertThat(d.loan().outstanding()).isEqualByComparingTo("500.00");
        assertThat(d.associatePhone()).isEqualTo("9999999999");
        assertThat(d.repayments()).extracting(LoanRepaymentResponse::id).containsExactly(newer.getId(), older.getId());
    }

    @Test
    void detailWithNoRepaymentsHasZeroRepaid() {
        AdvanceLoan l = loan("1000.00");
        when(loans.findById(l.getId())).thenReturn(Optional.of(l));
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        when(repayments.findByLoanIdOrderByPaymentDateDescCreatedAtDesc(l.getId())).thenReturn(List.of());
        AdvanceLoanDetailResponse d = service.detail(l.getId());
        assertThat(d.loan().repaid()).isEqualByComparingTo("0");
        assertThat(d.loan().outstanding()).isEqualByComparingTo("1000.00");
        assertThat(d.repayments()).isEmpty();
    }

    @Test
    void detailUnknownIdIsNotFound() {
        UUID id = UUID.randomUUID();
        when(loans.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.detail(id)).isInstanceOfSatisfying(AdvanceLoanException.class,
            e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }
}
