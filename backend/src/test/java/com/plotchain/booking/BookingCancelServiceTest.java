package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.sales.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// Unit 6. Separate from BookingServiceTest on purpose (unit 7 edits that file).
@ExtendWith(MockitoExtension.class)
class BookingCancelServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;
    @Mock BookingEventRepository bookingEventRepository;
    @Mock SaleService saleService;

    private BookingService bookingService;
    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-06-15T10:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, clock);
    }

    private EmiInstallment inst(int n, String amount, LocalDate due, InstallmentStatus status) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setDueDate(due);
        i.setStatus(status);
        return i;
    }

    private Plot plot(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    // Booking locked + ACTIVE, plot locked with given status, installments as given.
    private PlotBooking locked(PlotStatus plotStatus, EmiInstallment... installments) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(PLOT_ID);
        b.setAssociateId(ASSOCIATE_ID);
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal("600000.00"));
        b.setInstallmentCount(installments.length);
        b.setBookedAt(NOW);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plot(plotStatus)));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()))
            .thenReturn(List.of(installments));
        return b;
    }

    private CancelBookingRequest req(String reason) { return new CancelBookingRequest(reason); }

    @Test
    void cancelVoidsPendingKeepsPaidFreesPlotStampsBookingAndWritesEventWithReasonAndPaidTotal() {
        EmiInstallment paid = inst(1, "150000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID);
        EmiInstallment p2 = inst(2, "150000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.PENDING);
        EmiInstallment p3 = inst(3, "300000.00", LocalDate.of(2026, 5, 1), InstallmentStatus.PENDING); // overdue
        PlotBooking b = locked(PlotStatus.BOOKED, paid, p2, p3);
        Plot[] plotHolder = new Plot[1];
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenAnswer(inv -> {
            plotHolder[0] = plot(PlotStatus.BOOKED);
            return Optional.of(plotHolder[0]);
        });

        BookingResponse r = bookingService.cancelBooking(b.getId(), req("  buyer withdrew  "), ACTOR_ID);

        assertThat(paid.getStatus()).isEqualTo(InstallmentStatus.PAID);
        assertThat(p2.getStatus()).isEqualTo(InstallmentStatus.VOID);
        assertThat(p3.getStatus()).isEqualTo(InstallmentStatus.VOID);
        assertThat(plotHolder[0].getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        verify(plotRepository).save(plotHolder[0]);
        assertThat(b.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(b.getCancelledAt()).isEqualTo(NOW);
        assertThat(b.getCancelReason()).isEqualTo("buyer withdrew");           // trimmed
        verify(plotBookingRepository).save(b);

        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getType()).isEqualTo(BookingEventType.CANCELLED);
        assertThat(ev.getValue().getBookingId()).isEqualTo(b.getId());
        assertThat(ev.getValue().getActorId()).isEqualTo(ACTOR_ID);
        assertThat(ev.getValue().getCreatedAt()).isEqualTo(NOW);
        assertThat(ev.getValue().getDetail()).isEqualTo("reason: buyer withdrew; paid: 150000.00");

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(r.paidAmount()).isEqualByComparingTo("150000.00");
        assertThat(r.dueAmount()).isEqualByComparingTo("0");                  // VOID is not due
        assertThat(r.installments()).extracting(EmiInstallmentResponse::status)
            .containsExactly(InstallmentStatus.PAID, InstallmentStatus.VOID, InstallmentStatus.VOID);
        assertThat(r.installments()).noneMatch(EmiInstallmentResponse::overdue); // VOID never overdue
    }

    @Test
    void cancelWithNothingPaidRecordsZeroPaid() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).isEqualTo("reason: x; paid: 0.00");
    }

    @Test
    void cancelLocksTheBookingBeforeThePlotAndNeverUsesAnUnlockedFind() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        InOrder order = inOrder(plotBookingRepository, plotRepository);
        order.verify(plotBookingRepository).findByIdForUpdate(b.getId());
        order.verify(plotRepository).findByIdForUpdate(PLOT_ID);
        verify(plotRepository, never()).findById(any());
        verify(plotBookingRepository, never()).findById(any());
    }

    @Test
    void cancelOfAnUnknownBookingIs404AndTouchesNothingElse() {
        UUID id = UUID.randomUUID();
        when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.cancelBooking(id, req("x"), ACTOR_ID))
            .isInstanceOf(BookingNotFoundException.class);
        verifyNoInteractions(plotRepository, emiInstallmentRepository, bookingEventRepository);
    }

    @Test
    void cancelOfAConfirmedOrCancelledBookingIs409AndWritesNothing() {
        for (BookingStatus status : List.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)) {
            PlotBooking b = locked(PlotStatus.SOLD,
                inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID));
            b.setStatus(status);

            assertThatThrownBy(() -> bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID))
                .isInstanceOf(BookingNotActiveException.class);
        }
        verify(plotRepository, never()).findByIdForUpdate(any());
        verify(plotRepository, never()).save(any());
        verify(emiInstallmentRepository, never()).saveAll(any());
        verify(bookingEventRepository, never()).save(any());
    }

    // Decision (plan): drift never blocks cancel; a non-BOOKED plot is left exactly as found.
    @Test
    void cancelWithASoldPlotSucceedsLeavesThePlotSoldAndNotesItInTheEvent() {
        PlotBooking b = locked(PlotStatus.SOLD,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));
        Plot sold = plot(PlotStatus.SOLD);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(sold));

        BookingResponse r = bookingService.cancelBooking(b.getId(), req("drift"), ACTOR_ID);

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(sold.getStatus()).isEqualTo(PlotStatus.SOLD);
        verify(plotRepository, never()).save(any());
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).isEqualTo("reason: drift; paid: 0.00; plot left SOLD");
    }

    @Test
    void cancelWithAnAlreadyAvailablePlotLeavesItAvailableAndNotesIt() {
        PlotBooking b = locked(PlotStatus.AVAILABLE,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("drift"), ACTOR_ID);

        verify(plotRepository, never()).save(any());
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).endsWith("; plot left AVAILABLE");
    }

    // Stale-booking guard. Another ACTIVE/CONFIRMED booking holds the plot: do not free it, still cancel.
    @Test
    void cancelKeepsTheBookedPlotWhenAnotherLiveBookingHoldsItAndNotesTheHolder() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));
        Plot booked = plot(PlotStatus.BOOKED);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(booked));
        PlotBooking other = new PlotBooking();
        other.setId(UUID.randomUUID());
        when(plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
            PLOT_ID, b.getId(), List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED)))
            .thenReturn(Optional.of(other));

        BookingResponse r = bookingService.cancelBooking(b.getId(), req("stale"), ACTOR_ID);

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(b.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(booked.getStatus()).isEqualTo(PlotStatus.BOOKED);          // untouched
        verify(plotRepository, never()).save(any());
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail())
            .isEqualTo("reason: stale; paid: 0.00; plot kept: held by booking " + other.getId());
    }

    // Normal case: no other holder -> plot freed, no suffix. The guard query is asked with exactly
    // (plot, THIS booking excluded, [ACTIVE, CONFIRMED]).
    @Test
    void cancelFreesTheBookedPlotWhenNoOtherLiveBookingHoldsIt() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));
        Plot booked = plot(PlotStatus.BOOKED);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(booked));
        when(plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
            PLOT_ID, b.getId(), List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED)))
            .thenReturn(Optional.empty());

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        assertThat(booked.getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        verify(plotRepository).save(booked);
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).doesNotContain("plot kept").doesNotContain("plot left");
    }

    // A SOLD / AVAILABLE plot is never freed and the holder query is not even consulted.
    @Test
    void theOtherHolderQueryIsNotConsultedWhenThePlotIsNotBooked() {
        PlotBooking b = locked(PlotStatus.SOLD,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        verify(plotBookingRepository, never()).findFirstByPlotIdAndIdNotAndStatusIn(any(), any(), any());
    }

    // Unit-5 follow-up: "VOID installment exclusion from paid% has no unit test". VOID can now exist.
    // 4 x 150000 of 600000. 2 PAID + 1 VOID + 1 PENDING = 50% paid. At threshold 75 that must NOT
    // confirm; if VOID were wrongly counted as paid it would be 75% and would confirm.
    @Test
    void voidInstallmentsDoNotCountTowardsPaidPercentForAutoConfirm() {
        PlotBooking b = locked(PlotStatus.BOOKED);
        List<EmiInstallment> rows = List.of(
            inst(1, "150000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID),
            inst(2, "150000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.PAID),
            inst(3, "150000.00", LocalDate.of(2026, 9, 1), InstallmentStatus.VOID),
            inst(4, "150000.00", LocalDate.of(2026, 10, 1), InstallmentStatus.PENDING));
        BookingEmiConfig cfg = new BookingEmiConfig();
        cfg.setConfirmRule("AUTO_THRESHOLD");
        cfg.setConfirmThresholdPercent(75);
        when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.of(cfg));

        bookingService.afterInstallmentPaid(b, rows, ACTOR_ID);

        verifyNoInteractions(saleService);                                   // not confirmed
        assertThat(b.getStatus()).isEqualTo(BookingStatus.ACTIVE);
    }
}
