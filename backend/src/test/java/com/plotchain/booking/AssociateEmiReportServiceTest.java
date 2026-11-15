package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateEmiReportServiceTest {

    @Mock PlotBookingRepository bookings;
    @Mock AssociateRepository associates;
    @Mock PaymentLedgerService ledger;
    @Mock BookingService bookingService;

    UUID me = UUID.randomUUID();
    UUID child = UUID.randomUUID();

    private AssociateEmiReportService service() {
        return new AssociateEmiReportService(bookings, associates, ledger, bookingService);
    }

    private static PaymentRow row() {
        return new PaymentRow(UUID.randomUUID(), 1, Instant.now(), "VP1", "A", "P", "1", new BigDecimal("100"),
            PaymentMode.CASH, "R", "Staff", "Boss", null, null, null, null, null, null, null, null, null, null, null);
    }

    @Test
    void listsConfirmedPaymentsOfSelfAndDownlineAndHidesStaffNames() {
        when(bookings.findSelfAndDownlineIds(me, null)).thenReturn(List.of(me, child));
        when(ledger.listConfirmedFor(eq(List.of(me, child)), any(), any(), any(), eq(0), eq(20)))
            .thenReturn(new PaymentPageResponse(List.of(row()), 0, 20, 1, new BigDecimal("100"), new BigDecimal("100")));

        PaymentPageResponse r = service().list(me, null, null, null, null, null, 0, 20);

        assertThat(r.payments()).hasSize(1);
        assertThat(r.payments().get(0).entryBy()).isNull();
        assertThat(r.payments().get(0).confirmBy()).isNull();
        assertThat(r.grandTotal()).isEqualByComparingTo("100");
    }

    @Test
    void associateCodeOutsideMyTeamYieldsAnEmptyPageWithoutQueryingPayments() {
        when(bookings.findSelfAndDownlineIds(me, null)).thenReturn(List.of(me, child));
        Associate stranger = mock(Associate.class);
        when(stranger.getId()).thenReturn(UUID.randomUUID());
        when(associates.findByUserId("VP9")).thenReturn(Optional.of(stranger));

        PaymentPageResponse r = service().list(me, null, "vp9", null, null, null, 0, 20);

        assertThat(r.payments()).isEmpty();
        verify(ledger, never()).listConfirmedFor(any(), any(), any(), any(), any(Integer.class), any(Integer.class));
    }

    @Test
    void associateCodeInsideMyTeamNarrowsToThatAssociate() {
        when(bookings.findSelfAndDownlineIds(me, null)).thenReturn(List.of(me, child));
        Associate a = mock(Associate.class);
        when(a.getId()).thenReturn(child);
        when(associates.findByUserId("VP2")).thenReturn(Optional.of(a));
        when(ledger.listConfirmedFor(eq(List.of(child)), any(), any(), any(), eq(0), eq(20)))
            .thenReturn(new PaymentPageResponse(List.of(), 0, 20, 0, BigDecimal.ZERO, BigDecimal.ZERO));

        service().list(me, null, "vp2", null, null, null, 0, 20);

        verify(ledger).listConfirmedFor(eq(List.of(child)), any(), any(), any(), eq(0), eq(20));
    }

    @Test
    void bookingOutsideMyTeamIs404() {
        UUID id = UUID.randomUUID();
        PlotBooking b = mock(PlotBooking.class);
        when(b.getAssociateId()).thenReturn(UUID.randomUUID());
        when(bookings.findById(id)).thenReturn(Optional.of(b));
        when(bookings.findSelfAndDownlineIds(me, null)).thenReturn(List.of(me, child));

        assertThatThrownBy(() -> service().booking(me, id)).isInstanceOf(ResponseStatusException.class);
        verify(bookingService, never()).getBooking(any());
    }

    @Test
    void bookingInsideMyTeamHidesBuyerPhone() {
        UUID id = UUID.randomUUID();
        PlotBooking b = mock(PlotBooking.class);
        when(b.getAssociateId()).thenReturn(child);
        when(bookings.findById(id)).thenReturn(Optional.of(b));
        when(bookings.findSelfAndDownlineIds(me, null)).thenReturn(List.of(me, child));
        BookingResponse full = mock(BookingResponse.class);
        BookingResponse trimmed = mock(BookingResponse.class);
        when(bookingService.getBooking(id)).thenReturn(full);
        when(full.withoutBuyerPhone(true)).thenReturn(trimmed);

        assertThat(service().booking(me, id)).isSameAs(trimmed);
    }
}
