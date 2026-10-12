package com.plotchain.booking;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LastEmiReportServiceTest {

    @Mock PlotBookingRepository bookings;
    @Mock EmiInstallmentRepository installments;

    private LastEmiReportService service() { return new LastEmiReportService(bookings, installments); }

    private static LastEmiHead head(UUID id, String total, String discount) {
        return new LastEmiHead(id, Instant.now(), "VP1", "Asha", "Jane", "999", "A-1", "P",
            LocalDate.of(2026, 7, 1), new BigDecimal(discount), new BigDecimal(total));
    }

    private static EmiInstallment inst(UUID bookingId, int n, String amount, InstallmentStatus status) {
        EmiInstallment i = new EmiInstallment();
        i.setBookingId(bookingId);
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setStatus(status);
        return i;
    }

    @Test
    void paidCountsOnlyPaidInstallmentsEnteredAndVoidAndPendingAreRest() {
        UUID id = UUID.randomUUID();
        when(bookings.findLastEmiHeads(any(), any(), any())).thenReturn(List.of(head(id, "200", "0")));
        when(installments.findByBookingIdInOrderByInstallmentNumberAsc(any())).thenReturn(List.of(
            inst(id, 1, "100", InstallmentStatus.PAID), inst(id, 2, "50", InstallmentStatus.ENTERED),
            inst(id, 3, "50", InstallmentStatus.PENDING), inst(id, 4, "999", InstallmentStatus.VOID)));

        LastEmiRow r = service().report(null, null, null).get(0);

        assertThat(r.paid()).isEqualByComparingTo("100");
        assertThat(r.rest()).isEqualByComparingTo("100");
    }

    @Test
    void restIsTotalMinusPaidWhenNothingPaid() {
        UUID id = UUID.randomUUID();
        when(bookings.findLastEmiHeads(any(), any(), any())).thenReturn(List.of(head(id, "500000.00", "0")));
        when(installments.findByBookingIdInOrderByInstallmentNumberAsc(any())).thenReturn(List.of());

        LastEmiRow r = service().report(null, null, null).get(0);

        assertThat(r.paid()).isEqualByComparingTo("0");
        assertThat(r.rest()).isEqualByComparingTo("500000.00");
    }

    @Test
    void nullDatesBecomeOpenEndedSentinels() {
        when(bookings.findLastEmiHeads(any(), any(), any())).thenReturn(List.of());
        service().report(null, null, null);
        ArgumentCaptor<LocalDate> from = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<LocalDate> to = ArgumentCaptor.forClass(LocalDate.class);
        verify(bookings).findLastEmiHeads(from.capture(), to.capture(), eq(null));
        assertThat(from.getValue()).isEqualTo(LocalDate.of(1900, 1, 1));
        assertThat(to.getValue()).isEqualTo(LocalDate.of(9999, 12, 31));
    }

    @Test
    void emptyHeadsDoNotQueryInstallments() {
        when(bookings.findLastEmiHeads(any(), any(), any())).thenReturn(List.of());
        assertThat(service().report(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 1), null)).isEmpty();
        verifyNoInteractions(installments);
    }

    @Test
    void discountIsPassedThrough() {
        UUID id = UUID.randomUUID();
        when(bookings.findLastEmiHeads(any(), any(), any())).thenReturn(List.of(head(id, "550", "50")));
        when(installments.findByBookingIdInOrderByInstallmentNumberAsc(any())).thenReturn(List.of());
        assertThat(service().report(null, null, null).get(0).discount()).isEqualByComparingTo("50");
    }
}
