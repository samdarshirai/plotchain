package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

// Add Plot EMI: topUp adds one ENTERED payment row and consumes the oldest PENDING rows by the same amount.
@ExtendWith(MockitoExtension.class)
class BookingTopUpServiceTest {

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

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, projectRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService,
            Clock.fixed(NOW, ZoneOffset.UTC));
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

    // total 100000: #1 PAID 10000, #2/#3 PENDING 45000 each.
    private PlotBooking booking(BookingStatus status) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(UUID.randomUUID());
        b.setAssociateId(UUID.randomUUID());
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal("100000.00"));
        b.setInstallmentCount(3);
        b.setBookedAt(NOW);
        b.setStatus(status);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()))
            .thenReturn(List.of(inst(1, "10000.00", InstallmentStatus.PAID),
                inst(2, "45000.00", InstallmentStatus.PENDING), inst(3, "45000.00", InstallmentStatus.PENDING)));
        return b;
    }

    private TopUpRequest req(String amount, PaymentMode mode, String bank) {
        return new TopUpRequest(new BigDecimal(amount), mode, bank, "TXN1", null);
    }

    @Test
    void partialTopUpShrinksOldestPendingAndAddsEnteredRow() {
        PlotBooking b = booking(BookingStatus.ACTIVE);

        BookingResponse r = bookingService.topUp(b.getId(), req("20000.00", PaymentMode.UPI, "HDFC"), ACTOR_ID);

        assertThat(r.installments()).extracting(EmiInstallmentResponse::status).containsExactly(
            InstallmentStatus.PAID, InstallmentStatus.PENDING, InstallmentStatus.PENDING, InstallmentStatus.ENTERED);
        assertThat(r.installments()).extracting(EmiInstallmentResponse::amount).containsExactly(
            new BigDecimal("10000.00"), new BigDecimal("25000.00"), new BigDecimal("45000.00"), new BigDecimal("20000.00"));
        EmiInstallmentResponse pay = r.installments().get(3);
        assertThat(pay.installmentNumber()).isEqualTo(4);
        assertThat(pay.paymentMode()).isEqualTo(PaymentMode.UPI);
        assertThat(pay.bankName()).isEqualTo("HDFC");
        assertThat(pay.paymentRef()).isEqualTo("TXN1");
        assertThat(pay.paidAt()).isEqualTo(NOW);
        assertThat(r.dueAmount()).isEqualByComparingTo("90000.00"); // 70000 pending + 20000 entered
    }

    @Test
    void largeTopUpVoidsFullyCoveredRows() {
        PlotBooking b = booking(BookingStatus.ACTIVE);

        BookingResponse r = bookingService.topUp(b.getId(), req("50000.00", PaymentMode.CASH, null), ACTOR_ID);

        assertThat(r.installments()).extracting(EmiInstallmentResponse::status).containsExactly(
            InstallmentStatus.PAID, InstallmentStatus.VOID, InstallmentStatus.PENDING, InstallmentStatus.ENTERED);
        assertThat(r.installments().get(2).amount()).isEqualByComparingTo("40000.00");
        assertThat(r.installmentCount()).isEqualTo(3);
    }

    @Test
    void rejectsAmountAbovePending() {
        PlotBooking b = booking(BookingStatus.ACTIVE);
        assertThatThrownBy(() -> bookingService.topUp(b.getId(), req("90000.01", PaymentMode.CASH, null), ACTOR_ID))
            .isInstanceOf(InvalidTopUpException.class);
        verify(emiInstallmentRepository, never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void bankNameRequiredExceptForCash() {
        PlotBooking b = booking(BookingStatus.ACTIVE);
        assertThatThrownBy(() -> bookingService.topUp(b.getId(), req("1000.00", PaymentMode.NEFT, " "), ACTOR_ID))
            .isInstanceOf(InvalidTopUpException.class).hasMessageContaining("Bank name");
    }

    @Test
    void rejectsNonActiveBooking() {
        PlotBooking b = booking(BookingStatus.CANCELLED);
        assertThatThrownBy(() -> bookingService.topUp(b.getId(), req("1000.00", PaymentMode.CASH, null), ACTOR_ID))
            .isInstanceOf(BookingNotActiveException.class);
    }
}
