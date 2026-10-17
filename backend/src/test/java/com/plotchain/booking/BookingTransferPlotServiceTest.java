package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

// transferPlot: move an ACTIVE booking to another AVAILABLE plot of the same project, recalculating totals.
@ExtendWith(MockitoExtension.class)
class BookingTransferPlotServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock ProjectRepository projectRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;
    @Mock BookingEventRepository bookingEventRepository;
    @Mock SaleService saleService;

    private BookingService bookingService;
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-12T10:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, projectRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, clock);
    }

    private Plot plot(String no, String price, PlotStatus status, UUID projectId) {
        Plot p = new Plot(UUID.randomUUID(), projectId, no, PlotType.NORMAL,
            new BigDecimal("1000"), new BigDecimal("100"), new BigDecimal(price), status);
        lenient().when(plotRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    private EmiInstallment inst(int n, String amount, InstallmentStatus status) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setDueDate(LocalDate.of(2026, 10, 1).plusMonths(n));
        i.setStatus(status);
        return i;
    }

    // total 100000: #1 token 10000 PAID, #2 20000 ENTERED, #3/#4 35000 PENDING.
    private PlotBooking booking(Plot onPlot, BookingStatus status) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(onPlot.getId());
        b.setAssociateId(UUID.randomUUID());
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal("100000.00"));
        b.setDiscount(BigDecimal.ZERO);
        b.setBookedAt(NOW);
        b.setStatus(status);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()))
            .thenReturn(List.of(inst(1, "10000.00", InstallmentStatus.PAID), inst(2, "20000.00", InstallmentStatus.ENTERED),
                inst(3, "35000.00", InstallmentStatus.PENDING), inst(4, "35000.00", InstallmentStatus.PENDING)));
        return b;
    }

    @Test
    void movesBookingRecalculatesTotalAndResplitsPendingOnSameDueDates() {
        Plot oldPlot = plot("A-1", "100000.00", PlotStatus.BOOKED, PROJECT_ID);
        Plot newPlot = plot("A-2", "150000.00", PlotStatus.AVAILABLE, PROJECT_ID);
        PlotBooking b = booking(oldPlot, BookingStatus.ACTIVE);

        BookingResponse r = bookingService.transferPlot(b.getId(), newPlot.getId(), ACTOR_ID);

        assertThat(b.getPlotId()).isEqualTo(newPlot.getId());
        assertThat(b.getTotalAmount()).isEqualByComparingTo("150000.00");
        assertThat(oldPlot.getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        assertThat(newPlot.getStatus()).isEqualTo(PlotStatus.BOOKED);
        // balance 150000 - (10000 + 20000) = 120000 over 2 new rows; old 2 PENDING voided
        assertThat(r.installments()).extracting(EmiInstallmentResponse::status).containsExactly(
            InstallmentStatus.PAID, InstallmentStatus.ENTERED, InstallmentStatus.VOID, InstallmentStatus.VOID,
            InstallmentStatus.PENDING, InstallmentStatus.PENDING);
        assertThat(r.installments().get(4).amount()).isEqualByComparingTo("60000.00");
        assertThat(r.installments().get(5).amount()).isEqualByComparingTo("60000.00");
        assertThat(b.getInstallmentCount()).isEqualTo(4);
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getType()).isEqualTo(BookingEventType.PLOT_TRANSFERRED);
    }

    @Test
    void rejectsNonActiveBooking() {
        Plot oldPlot = plot("A-1", "100000.00", PlotStatus.BOOKED, PROJECT_ID);
        Plot newPlot = plot("A-2", "150000.00", PlotStatus.AVAILABLE, PROJECT_ID);
        PlotBooking b = booking(oldPlot, BookingStatus.CONFIRMED);

        assertThatThrownBy(() -> bookingService.transferPlot(b.getId(), newPlot.getId(), ACTOR_ID))
            .isInstanceOf(BookingNotActiveException.class);
        verify(plotBookingRepository, never()).save(any());
    }

    @Test
    void rejectsSamePlot() {
        Plot oldPlot = plot("A-1", "100000.00", PlotStatus.BOOKED, PROJECT_ID);
        PlotBooking b = booking(oldPlot, BookingStatus.ACTIVE);

        assertThatThrownBy(() -> bookingService.transferPlot(b.getId(), oldPlot.getId(), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class);
    }

    @Test
    void rejectsOtherProject() {
        Plot oldPlot = plot("A-1", "100000.00", PlotStatus.BOOKED, PROJECT_ID);
        Plot newPlot = plot("B-1", "150000.00", PlotStatus.AVAILABLE, UUID.randomUUID());
        PlotBooking b = booking(oldPlot, BookingStatus.ACTIVE);

        assertThatThrownBy(() -> bookingService.transferPlot(b.getId(), newPlot.getId(), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class);
        verify(plotBookingRepository, never()).save(any());
    }

    @Test
    void rejectsUnavailableTarget() {
        Plot oldPlot = plot("A-1", "100000.00", PlotStatus.BOOKED, PROJECT_ID);
        Plot newPlot = plot("A-2", "150000.00", PlotStatus.BOOKED, PROJECT_ID);
        PlotBooking b = booking(oldPlot, BookingStatus.ACTIVE);

        assertThatThrownBy(() -> bookingService.transferPlot(b.getId(), newPlot.getId(), ACTOR_ID))
            .isInstanceOf(PlotNotAvailableException.class);
    }

    @Test
    void rejectsTargetCheaperThanAlreadyPaid() {
        Plot oldPlot = plot("A-1", "100000.00", PlotStatus.BOOKED, PROJECT_ID);
        Plot newPlot = plot("A-2", "30000.00", PlotStatus.AVAILABLE, PROJECT_ID);
        PlotBooking b = booking(oldPlot, BookingStatus.ACTIVE);

        assertThatThrownBy(() -> bookingService.transferPlot(b.getId(), newPlot.getId(), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class);
        verify(plotBookingRepository, never()).save(any());
    }
}
