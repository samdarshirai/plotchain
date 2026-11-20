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

// Edit/delete of unconfirmed payments and booking details before the first payment is confirmed.
@ExtendWith(MockitoExtension.class)
class BookingEditServiceTest {

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
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, null, null,
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

    // total 100000: #1 token ENTERED 10000, #2/#3 PENDING 45000 each (second status of #1 configurable).
    private PlotBooking booking(BookingStatus status, InstallmentStatus first) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(UUID.randomUUID());
        b.setAssociateId(UUID.randomUUID());
        b.setSponsorId(UUID.randomUUID());
        b.setBuyerAssociateId(b.getAssociateId());
        b.setListPrice(new BigDecimal("100000.00"));
        b.setDiscount(BigDecimal.ZERO);
        b.setExtraPrice(BigDecimal.ZERO);
        b.setTotalAmount(new BigDecimal("100000.00"));
        b.setInstallmentCount(3);
        b.setBookedAt(NOW);
        b.setStatus(status);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()))
            .thenReturn(List.of(inst(1, "10000.00", first),
                inst(2, "45000.00", InstallmentStatus.PENDING), inst(3, "45000.00", InstallmentStatus.PENDING)));
        return b;
    }

    private TopUpRequest req(String amount) {
        return new TopUpRequest(new BigDecimal(amount), PaymentMode.UPI, "HDFC", "TXN9", null, "RCP-9");
    }

    @Test
    void editingTokenAmountRebalancesPending() {
        PlotBooking b = booking(BookingStatus.ACTIVE, InstallmentStatus.ENTERED);

        BookingResponse r = bookingService.updatePayment(b.getId(), 1, req("20000"), ACTOR_ID);

        assertThat(r.installments()).extracting(EmiInstallmentResponse::amount)
            .usingComparatorForType(BigDecimal::compareTo, BigDecimal.class)
            .containsExactly(new BigDecimal("20000"), new BigDecimal("40000"), new BigDecimal("40000"));
        assertThat(r.installments().get(0).paymentRef()).isEqualTo("TXN9");
        verify(bookingEventRepository).save(org.mockito.ArgumentMatchers.any(BookingEvent.class));
    }

    @Test
    void deletingTokenVoidsItAndReturnsAmountToPending() {
        PlotBooking b = booking(BookingStatus.ACTIVE, InstallmentStatus.ENTERED);

        BookingResponse r = bookingService.deletePayment(b.getId(), 1, ACTOR_ID);

        assertThat(r.installments()).extracting(EmiInstallmentResponse::status).containsExactly(
            InstallmentStatus.VOID, InstallmentStatus.PENDING, InstallmentStatus.PENDING);
        assertThat(r.installments().get(1).amount().add(r.installments().get(2).amount()))
            .isEqualByComparingTo("100000");
        assertThat(r.installmentCount()).isEqualTo(2);
    }

    @Test
    void confirmedPaymentCannotBeEditedOrDeleted() {
        PlotBooking b = booking(BookingStatus.ACTIVE, InstallmentStatus.PAID);
        assertThatThrownBy(() -> bookingService.updatePayment(b.getId(), 1, req("1000"), ACTOR_ID))
            .isInstanceOf(PaymentNotEditableException.class);
        assertThatThrownBy(() -> bookingService.deletePayment(b.getId(), 1, ACTOR_ID))
            .isInstanceOf(PaymentNotEditableException.class);
        verify(emiInstallmentRepository, never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void rejectsAmountAboveTotalAndNonActiveBooking() {
        PlotBooking b = booking(BookingStatus.ACTIVE, InstallmentStatus.ENTERED);
        assertThatThrownBy(() -> bookingService.updatePayment(b.getId(), 1, req("100001"), ACTOR_ID))
            .isInstanceOf(InvalidTopUpException.class);
        PlotBooking c = booking(BookingStatus.CANCELLED, InstallmentStatus.ENTERED);
        assertThatThrownBy(() -> bookingService.deletePayment(c.getId(), 1, ACTOR_ID))
            .isInstanceOf(BookingNotActiveException.class);
    }

    @Test
    void discountChangeResplitsPendingAndKeepsEntered() {
        PlotBooking b = booking(BookingStatus.ACTIVE, InstallmentStatus.ENTERED);

        BookingResponse r = bookingService.updateBooking(b.getId(),
            new UpdateBookingRequest(null, null, "9999999999", new BigDecimal("10000"), null, null), ACTOR_ID);

        assertThat(b.getTotalAmount()).isEqualByComparingTo("90000");
        assertThat(b.getBuyerPhone()).isEqualTo("9999999999");
        assertThat(r.installments().get(0).amount()).isEqualByComparingTo("10000");
        assertThat(r.installments().get(1).amount().add(r.installments().get(2).amount()))
            .isEqualByComparingTo("80000");
    }

    @Test
    void bookingEditBlockedOnceAnyPaymentConfirmedOrTotalBelowEntered() {
        PlotBooking paid = booking(BookingStatus.ACTIVE, InstallmentStatus.PAID);
        assertThatThrownBy(() -> bookingService.updateBooking(paid.getId(),
            new UpdateBookingRequest(null, null, null, null, null, null), ACTOR_ID))
            .isInstanceOf(PaymentNotEditableException.class);
        PlotBooking b = booking(BookingStatus.ACTIVE, InstallmentStatus.ENTERED);
        assertThatThrownBy(() -> bookingService.updateBooking(b.getId(),
            new UpdateBookingRequest(null, null, null, new BigDecimal("95000"), null, null), ACTOR_ID))
            .isInstanceOf(InvalidTopUpException.class);
    }
}
