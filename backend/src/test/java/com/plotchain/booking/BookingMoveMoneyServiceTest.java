package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.expense.ExpenseRequest;
import com.plotchain.expense.ExpenseService;
import com.plotchain.expense.PayMode;
import com.plotchain.expensetype.ExpenseType;
import com.plotchain.expensetype.ExpenseTypeRepository;
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
import static org.mockito.Mockito.verifyNoInteractions;

// moveMoney: move PAID money between two ACTIVE bookings of one buyer (plot 2 -> plot 1 in the spec examples).
@ExtendWith(MockitoExtension.class)
class BookingMoveMoneyServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock ProjectRepository projectRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;
    @Mock BookingEventRepository bookingEventRepository;
    @Mock SaleService saleService;
    @Mock ExpenseService expenseService;
    @Mock ExpenseTypeRepository expenseTypeRepository;

    private BookingService bookingService;
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID BUYER_ID = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-11-17T10:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, projectRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService,
            expenseService, expenseTypeRepository, clock);
    }

    private Plot plot(String no) {
        Plot p = new Plot(UUID.randomUUID(), PROJECT_ID, no, PlotType.NORMAL,
            new BigDecimal("1000"), new BigDecimal("100"), new BigDecimal("1000000.00"), PlotStatus.BOOKED);
        lenient().when(plotRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    private EmiInstallment inst(int n, String amount, InstallmentStatus status) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setDueDate(LocalDate.of(2026, 12, 1).plusMonths(n));
        i.setStatus(status);
        return i;
    }

    private PlotBooking booking(Plot plot, UUID buyer, EmiInstallment... rows) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(plot.getId());
        b.setAssociateId(buyer);
        b.setBuyerAssociateId(buyer);
        b.setTotalAmount(new BigDecimal("1000000.00"));
        b.setDiscount(BigDecimal.ZERO);
        b.setBookedAt(NOW);
        b.setStatus(BookingStatus.ACTIVE);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId())).thenReturn(List.of(rows));
        return b;
    }

    private MoveMoneyRequest move(UUID target, String amount, boolean refund, String pct, PayMode mode) {
        return new MoveMoneyRequest(target, new BigDecimal(amount), refund,
            pct == null ? null : new BigDecimal(pct), mode, refund ? "Customer asked" : null);
    }

    private void refundTypeExists() {
        ExpenseType type = new ExpenseType(UUID.randomUUID());
        type.setName("Plot Transfer Refund");
        lenient().when(expenseTypeRepository.findByNameIgnoreCase("Plot Transfer Refund")).thenReturn(Optional.of(type));
    }

    // Spec case 1: 5L paid on plot 2 moves to plot 1 (5L paid, 5L due) -> plot 1 fully paid, plot 2 free again.
    @Test
    void fullMoveCompletesTargetAndFreesSource() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID), inst(2, "500000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID), inst(2, "500000.00", InstallmentStatus.PENDING));

        BookingResponse r = bookingService.moveMoney(source.getId(), move(target.getId(), "500000", false, null, null), ACTOR_ID);

        assertThat(target.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(p1.getStatus()).isEqualTo(PlotStatus.SOLD);
        assertThat(source.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(p2.getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        assertThat(r.installments()).extracting(EmiInstallmentResponse::status)
            .containsExactly(InstallmentStatus.VOID, InstallmentStatus.VOID);
        verifyNoInteractions(expenseService);
        verifyNoInteractions(saleService);
    }

    // Spec case 2: plot 1 paid 7L, plot 2 paid 5L; 3L moves, 2L left on plot 2 and kept.
    @Test
    void partialMoveKeepsLeftoverOnSource() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, BUYER_ID, inst(1, "700000.00", InstallmentStatus.PAID), inst(2, "300000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID), inst(2, "500000.00", InstallmentStatus.PENDING));

        BookingResponse r = bookingService.moveMoney(source.getId(), move(target.getId(), "300000", false, null, null), ACTOR_ID);

        assertThat(target.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(source.getStatus()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(p2.getStatus()).isEqualTo(PlotStatus.BOOKED);
        assertThat(r.installments().get(0).amount()).isEqualByComparingTo("200000.00");
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository, org.mockito.Mockito.atLeast(2)).save(ev.capture());
        assertThat(ev.getAllValues()).extracting(BookingEvent::getType).contains(BookingEventType.MONEY_MOVED);
    }

    @Test
    void partialMoveWithRefundCancelsSourceAndPostsTransferRefund() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, BUYER_ID, inst(1, "700000.00", InstallmentStatus.PAID), inst(2, "300000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID), inst(2, "500000.00", InstallmentStatus.PENDING));
        refundTypeExists();

        bookingService.moveMoney(source.getId(), move(target.getId(), "300000", true, "35", PayMode.CASH), ACTOR_ID);

        // leftover 200000, charge 35% = 70000, refund 130000
        ArgumentCaptor<ExpenseRequest> ex = ArgumentCaptor.forClass(ExpenseRequest.class);
        verify(expenseService).create(ex.capture(), org.mockito.ArgumentMatchers.eq(ACTOR_ID));
        assertThat(ex.getValue().amount()).isEqualByComparingTo("130000.00");
        assertThat(source.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(source.getCancellationCharge()).isEqualByComparingTo("70000.00");
        assertThat(p2.getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        assertThat(p2.getPlotNo()).isEqualTo("P-2 New1");
    }

    @Test
    void refundNeedsChargePctAndPayMode() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, BUYER_ID, inst(1, "700000.00", InstallmentStatus.PAID), inst(2, "300000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID));

        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(target.getId(), "300000", true, null, PayMode.CASH), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class).hasMessageContaining("charge");
        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(target.getId(), "300000", true, "35", null), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class).hasMessageContaining("Pay mode");
        verify(plotBookingRepository, never()).save(any());
    }

    @Test
    void rejectsDifferentBuyer() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, UUID.randomUUID(), inst(1, "100000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID));

        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(target.getId(), "100000", false, null, null), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class).hasMessageContaining("same buyer");
    }

    @Test
    void rejectsAmountAboveSourcePaidOrTargetBalance() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, BUYER_ID, inst(1, "300000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID));

        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(target.getId(), "600000", false, null, null), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class).hasMessageContaining("paid amount");
        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(target.getId(), "400000", false, null, null), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class).hasMessageContaining("remaining balance");
    }

    @Test
    void rejectsNonActiveAndSameBooking() {
        Plot p1 = plot("P-1"); Plot p2 = plot("P-2");
        PlotBooking target = booking(p1, BUYER_ID, inst(1, "300000.00", InstallmentStatus.PENDING));
        PlotBooking source = booking(p2, BUYER_ID, inst(1, "500000.00", InstallmentStatus.PAID));
        target.setStatus(BookingStatus.CONFIRMED);

        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(target.getId(), "100000", false, null, null), ACTOR_ID))
            .isInstanceOf(BookingNotActiveException.class);
        assertThatThrownBy(() -> bookingService.moveMoney(source.getId(), move(source.getId(), "100000", false, null, null), ACTOR_ID))
            .isInstanceOf(InvalidPlotTransferException.class);
    }
}
