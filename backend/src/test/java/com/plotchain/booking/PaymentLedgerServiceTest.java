package com.plotchain.booking;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentLedgerServiceTest {

    @Mock EmiInstallmentRepository repo;

    private PaymentLedgerService service() { return new PaymentLedgerService(repo); }

    private static PaymentRow row(String amount) {
        return new PaymentRow(UUID.randomUUID(), 1, Instant.now(), "VP1", "A", "P", "1", new BigDecimal(amount),
            PaymentMode.CASH, "R", "E", null, null);
    }

    @Test
    void listConvertsDatesToHalfOpenUtcInstantsAndUnboundedWhenNull() {
        when(repo.findPayments(any(), any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));
        service().list(InstallmentStatus.ENTERED, LocalDate.of(2026, 6, 2), LocalDate.of(2026, 6, 3), null, 0, 20);
        verify(repo).findPayments(eq(InstallmentStatus.ENTERED), eq(Instant.parse("2026-06-02T00:00:00Z")),
            eq(Instant.parse("2026-06-04T00:00:00Z")), eq(null), any());

        service().list(InstallmentStatus.PAID, null, null, null, 0, 20);
        verify(repo).findPayments(eq(InstallmentStatus.PAID), eq(Instant.EPOCH),
            eq(Instant.parse("9999-01-01T00:00:00Z")), eq(null), any());
    }

    @Test
    void pageTotalSumsOnlyTheRowsOnThePageAndGrandTotalComesFromTheSumQuery() {
        when(repo.findPayments(any(), any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(row("100"), row("50")), PageRequest.of(0, 2), 5));
        when(repo.sumPayments(any(), any(), any(), any())).thenReturn(new BigDecimal("400"));

        PaymentPageResponse r = service().list(InstallmentStatus.ENTERED, null, null, null, 0, 2);

        assertThat(r.pageTotal()).isEqualByComparingTo("150");
        assertThat(r.grandTotal()).isEqualByComparingTo("400");
        assertThat(r.totalElements()).isEqualTo(5);
    }

    @Test
    void grandTotalIsZeroWhenSumQueryReturnsNull() {
        when(repo.findPayments(any(), any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));
        when(repo.sumPayments(any(), any(), any(), any())).thenReturn(null);

        PaymentPageResponse r = service().list(InstallmentStatus.PAID, null, null, null, 0, 20);

        assertThat(r.grandTotal()).isEqualByComparingTo("0");
        assertThat(r.pageTotal()).isEqualByComparingTo("0");
    }

    @Test
    void listPassesAnUnsortedPageableWithPageAndSize() {
        when(repo.findPayments(any(), any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));
        service().list(InstallmentStatus.ENTERED, null, null, null, 3, 7);
        ArgumentCaptor<Pageable> c = ArgumentCaptor.forClass(Pageable.class);
        verify(repo).findPayments(any(), any(), any(), any(), c.capture());
        assertThat(c.getValue().getPageNumber()).isEqualTo(3);
        assertThat(c.getValue().getPageSize()).isEqualTo(7);
        assertThat(c.getValue().getSort().isUnsorted()).isTrue();
    }
}
