package com.plotchain.expense;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.expensetype.ExpenseType;
import com.plotchain.expensetype.ExpenseTypeRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTest {

    @Mock ExpenseRepository repository;
    @Mock ExpenseTypeRepository typeRepository;
    @Mock ProjectRepository projectRepository;
    @Mock SettingsAuditLogRepository auditLogRepository;
    @Mock AssociateRepository associateRepository;

    ExpenseService service;
    UUID typeId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new ExpenseService(repository, typeRepository, projectRepository, audit);
    }

    private ExpenseType activeType() {
        ExpenseType t = new ExpenseType(typeId);
        t.setName("Travel");
        return t;
    }

    private ExpenseRequest request(String amount) {
        return new ExpenseRequest(LocalDate.of(2026, 10, 1), typeId, null, " Vendor ", new BigDecimal(amount),
            PayMode.UPI, " HDFC ", "  ", "note");
    }

    @Test
    void createTrimsTextAndStoresBlankTxnAsNull() {
        when(typeRepository.findById(typeId)).thenReturn(Optional.of(activeType()));
        ExpenseResponse r = service.create(request("100.50"), UUID.randomUUID());
        assertThat(r.payTo()).isEqualTo("Vendor");
        assertThat(r.bankName()).isEqualTo("HDFC");
        assertThat(r.txnNo()).isNull();
        assertThat(r.expenseTypeName()).isEqualTo("Travel");
        verify(repository).save(any(Expense.class));
    }

    @Test
    void createRejectsInactiveType() {
        ExpenseType t = activeType();
        t.setStatus(ExpenseType.Status.INACTIVE);
        when(typeRepository.findById(typeId)).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> service.create(request("10"), UUID.randomUUID()))
            .isInstanceOf(ExpenseException.class).hasMessageContaining("inactive");
    }

    @Test
    void createRejectsUnknownType() {
        when(typeRepository.findById(typeId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(request("10"), UUID.randomUUID()))
            .isInstanceOf(ExpenseException.class);
    }

    @Test
    void createRejectsMoreThanTwoDecimals() {
        assertThatThrownBy(() -> service.create(request("10.005"), UUID.randomUUID()))
            .isInstanceOf(ExpenseException.class).hasMessageContaining("2 decimal");
    }

    @Test
    void listRejectsFromAfterTo() {
        assertThatThrownBy(() -> service.list(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1), null, null))
            .isInstanceOf(ExpenseException.class);
    }

    @Test
    void listFiltersByTypeInMemory() {
        UUID other = UUID.randomUUID();
        Expense a = new Expense(UUID.randomUUID(), LocalDate.of(2026, 10, 1), typeId, null, "A", new BigDecimal("1.00"), PayMode.CASH, null, null, null);
        Expense b = new Expense(UUID.randomUUID(), LocalDate.of(2026, 10, 2), other, null, "B", new BigDecimal("2.00"), PayMode.CASH, null, null, null);
        when(repository.findByExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(any(), any())).thenReturn(List.of(a, b));
        when(typeRepository.findAllById(any())).thenReturn(List.of(activeType()));
        assertThat(service.list(null, null, typeId, null)).extracting(ExpenseResponse::payTo).containsExactly("A");
    }
}
