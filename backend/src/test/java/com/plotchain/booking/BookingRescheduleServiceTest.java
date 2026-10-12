package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
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

// Reference-gap U4: rescheduleBooking re-splits the unpaid balance of an ACTIVE booking.
@ExtendWith(MockitoExtension.class)
class BookingRescheduleServiceTest {

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
    private static final Instant NOW = Instant.parse("2026-10-12T10:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, projectRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, clock);
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

    private PlotBooking locked(String total, BookingStatus status, EmiInstallment... installments) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(UUID.randomUUID());
        b.setAssociateId(UUID.randomUUID());
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal(total));
        b.setInstallmentCount(installments.length);
        b.setBookedAt(NOW);
        b.setStatus(status);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()))
            .thenReturn(List.of(installments));
        return b;
    }

    // total 100000: #1 token 10000 PAID, #2 20000 ENTERED, #3/#4 35000 PENDING.
    private PlotBooking standard() {
        return locked("100000.00", BookingStatus.ACTIVE,
            inst(1, "10000.00", InstallmentStatus.PAID), inst(2, "20000.00", InstallmentStatus.ENTERED),
            inst(3, "35000.00", InstallmentStatus.PENDING), inst(4, "35000.00", InstallmentStatus.PENDING));
    }

    private RescheduleRequest req(int count, LocalDate firstDue) { return new RescheduleRequest(count, firstDue); }

    @Test
    void splitsBalanceOverNewPendingRows() {
        PlotBooking b = standard();

        BookingResponse r = bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID);

        List<EmiInstallmentResponse> rows = r.installments();
        assertThat(rows).extracting(EmiInstallmentResponse::installmentNumber).containsExactly(1, 2, 3, 4, 5, 6, 7);
        assertThat(rows).extracting(EmiInstallmentResponse::status).containsExactly(
            InstallmentStatus.PAID, InstallmentStatus.ENTERED, InstallmentStatus.VOID, InstallmentStatus.VOID,
            InstallmentStatus.PENDING, InstallmentStatus.PENDING, InstallmentStatus.PENDING);
        assertThat(rows.subList(4, 7)).extracting(EmiInstallmentResponse::amount)
            .containsExactly(new BigDecimal("23333.33"), new BigDecimal("23333.33"), new BigDecimal("23333.34"));
        assertThat(rows.subList(4, 7)).extracting(EmiInstallmentResponse::dueDate)
            .containsExactly(LocalDate.of(2026, 11, 5), LocalDate.of(2026, 12, 5), LocalDate.of(2027, 1, 5));
        assertThat(r.installmentCount()).isEqualTo(5);
        assertThat(r.paidAmount()).isEqualByComparingTo("10000.00");
        assertThat(r.dueAmount()).isEqualByComparingTo("90000.00");
    }

    @Test
    void monthEndFirstDueDoesNotDrift() {
        PlotBooking b = standard();
        Clock early = Clock.fixed(Instant.parse("2026-01-10T10:00:00Z"), ZoneOffset.UTC);
        BookingService svc = new BookingService(plotRepository, projectRepository, associateRepository,
            bookingEmiConfigRepository, plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, early);

        BookingResponse r = svc.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 1, 31)), ACTOR_ID);

        assertThat(r.installments().subList(4, 7)).extracting(EmiInstallmentResponse::dueDate)
            .containsExactly(LocalDate.of(2026, 1, 31), LocalDate.of(2026, 2, 28), LocalDate.of(2026, 3, 31));
    }

    @Test
    void writesOneRescheduledEventWithCounts() {
        PlotBooking b = standard();

        bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID);

        ArgumentCaptor<BookingEvent> captor = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(captor.capture());
        BookingEvent e = captor.getValue();
        assertThat(e.getType()).isEqualTo(BookingEventType.RESCHEDULED);
        assertThat(e.getActorId()).isEqualTo(ACTOR_ID);
        assertThat(e.getDetail()).contains("voided 2 pending").contains("balance 70000.00 over 3 from 2026-11-05");
    }

    @Test
    void rejectsNonActiveBooking() {
        PlotBooking b = locked("100000.00", BookingStatus.CONFIRMED, inst(3, "35000.00", InstallmentStatus.PENDING));

        assertThatThrownBy(() -> bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID))
            .isInstanceOf(BookingNotActiveException.class);
        verify(emiInstallmentRepository, never()).saveAll(any());
    }

    @Test
    void rejectsWhenNoPendingBalance() {
        PlotBooking b = locked("30000.00", BookingStatus.ACTIVE,
            inst(1, "10000.00", InstallmentStatus.PAID), inst(2, "20000.00", InstallmentStatus.ENTERED));

        assertThatThrownBy(() -> bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID))
            .isInstanceOf(NothingToRescheduleException.class);
        verify(emiInstallmentRepository, never()).saveAll(any());
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void rejectsPastFirstDueDateButAcceptsToday() {
        PlotBooking b = standard();

        assertThatThrownBy(() -> bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 10, 11)), ACTOR_ID))
            .isInstanceOf(InvalidRescheduleException.class);
        verify(emiInstallmentRepository, never()).saveAll(any());

        BookingResponse r = bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 10, 12)), ACTOR_ID);
        assertThat(r.installments().get(4).dueDate()).isEqualTo(LocalDate.of(2026, 10, 12));
    }

    @Test
    void rejectsBalanceTooSmallForCount() {
        PlotBooking b = locked("10000.05", BookingStatus.ACTIVE,
            inst(1, "10000.00", InstallmentStatus.PAID), inst(2, "0.05", InstallmentStatus.PENDING));

        assertThatThrownBy(() -> bookingService.rescheduleBooking(b.getId(), req(60, LocalDate.of(2026, 11, 5)), ACTOR_ID))
            .isInstanceOf(InvalidRescheduleException.class);
        verify(emiInstallmentRepository, never()).saveAll(any());
    }

    @Test
    void unknownBookingIs404() {
        UUID id = UUID.randomUUID();
        lenient().when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.rescheduleBooking(id, req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID))
            .isInstanceOf(BookingNotFoundException.class);
    }

    @Test
    void locksBookingBeforeReadingInstallments() {
        PlotBooking b = standard();

        bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID);

        InOrder order = inOrder(plotBookingRepository, emiInstallmentRepository);
        order.verify(plotBookingRepository).findByIdForUpdate(b.getId());
        order.verify(emiInstallmentRepository).findByBookingIdOrderByInstallmentNumberAsc(b.getId());
    }

    @Test
    void doesNotChangeStatusOrTouchPlot() {
        PlotBooking b = standard();

        bookingService.rescheduleBooking(b.getId(), req(3, LocalDate.of(2026, 11, 5)), ACTOR_ID);

        assertThat(b.getStatus()).isEqualTo(BookingStatus.ACTIVE);
        verify(plotRepository, never()).findByIdForUpdate(any()); // toResponse reads plots via findAllById
    }
}
