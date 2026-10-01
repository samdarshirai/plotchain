package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;
    @Mock BookingEventRepository bookingEventRepository;
    @Mock SaleService saleService;

    BookingService bookingService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-06-15T10:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, clock);
    }

    private PlotBooking bookingWithBuyer() {
        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(PLOT_ID);
        booking.setAssociateId(ASSOCIATE_ID);
        booking.setBuyerName("Jane Buyer");
        booking.setTotalAmount(new BigDecimal("600000.00"));
        booking.setInstallmentCount(1);
        booking.setBookedAt(NOW);
        return booking;
    }

    private EmiInstallment installment(int n, String amount, LocalDate due, InstallmentStatus status) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setDueDate(due);
        i.setStatus(status);
        return i;
    }

    private void stubOwnPage(PlotBooking booking, List<EmiInstallment> installments) {
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(eq(ASSOCIATE_ID), any()))
            .thenReturn(new PageImpl<>(List.of(booking), PageRequest.of(0, 20), 1));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(installments);
    }

    @Test
    void getMyBookingsFlagsOnlyPendingInstallmentsDueBeforeTodayUtcAsOverdue() {
        PlotBooking booking = bookingWithBuyer();
        stubOwnPage(booking, List.of(
            installment(1, "100.00", LocalDate.of(2026, 6, 14), InstallmentStatus.PENDING),
            installment(2, "100.00", LocalDate.of(2026, 6, 15), InstallmentStatus.PENDING),
            installment(3, "100.00", LocalDate.of(2026, 1, 1), InstallmentStatus.PAID),
            installment(4, "100.00", LocalDate.of(2026, 1, 1), InstallmentStatus.VOID)));

        BookingResponse r = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20).bookings().get(0);

        assertThat(r.installments()).extracting(EmiInstallmentResponse::overdue)
            .containsExactly(true, false, false, false);
    }

    @Test
    void getMyBookingsComputesPaidAndDueAmountsAndExposesStatusAndBuyer() {
        PlotBooking booking = bookingWithBuyer();
        EmiInstallment paid = installment(1, "200000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID);
        paid.setPaidAt(NOW);
        stubOwnPage(booking, List.of(
            paid,
            installment(2, "250000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.PENDING),
            installment(3, "150000.00", LocalDate.of(2026, 9, 1), InstallmentStatus.VOID)));

        BookingResponse r = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20).bookings().get(0);

        assertThat(r.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(r.buyerName()).isEqualTo("Jane Buyer");
        assertThat(r.paidAmount()).isEqualByComparingTo("200000.00");
        assertThat(r.dueAmount()).isEqualByComparingTo("250000.00");
        assertThat(r.installments().get(0).status()).isEqualTo(InstallmentStatus.PAID);
        assertThat(r.installments().get(0).paidAt()).isEqualTo(NOW);
    }

    @Test
    void getMyBookingsDueAmountOfACancelledBookingIsZeroBecauseVoidInstallmentsDoNotCount() {
        PlotBooking booking = bookingWithBuyer();
        booking.setStatus(BookingStatus.CANCELLED);
        stubOwnPage(booking, List.of(
            installment(1, "300000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.VOID),
            installment(2, "300000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.VOID)));

        BookingResponse r = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20).bookings().get(0);

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(r.dueAmount()).isEqualByComparingTo("0");
    }

    @Test
    void createBookingResponseIsActiveWithAllInstallmentsPendingNoneOverdueAndZeroPaid() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        BookingResponse r = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(r.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(r.paidAmount()).isEqualByComparingTo("0");
        assertThat(r.dueAmount()).isEqualByComparingTo("600000.00");
        assertThat(r.installments()).allMatch(i -> i.status() == InstallmentStatus.PENDING && !i.overdue());
    }

    private Plot plotWithStatusAndPrice(PlotStatus status, String price) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal(price), status);
    }

    private CreateBookingRequest requestFor(UUID plotId, UUID associateId) {
        return new CreateBookingRequest(plotId, associateId, "Jane Buyer", "9999999999");
    }

    private BookingEmiConfig emiConfig(boolean enabled, int count) {
        BookingEmiConfig config = new BookingEmiConfig();
        config.setEmiEnabled(enabled);
        config.setDefaultInstallmentCount(count);
        config.setConfirmRule("MANUAL");
        return config;
    }

    // Test-fixture note: the associate stub must set its id to ASSOCIATE_ID -- the same
    // "a repository lookup by id returns an entity carrying that id" precedent
    // SaleServiceTest.associateWithPosition establishes -- because BookingService snapshots
    // associate.getId() into PlotBooking.associateId (mirroring Sale.setAssociateId), not the
    // raw request associateId.
    private Associate associateWithId(UUID id) {
        Associate associate = new Associate();
        associate.setId(id);
        return associate;
    }

    private void stubHappyPathGuardsAndDependencies(String price, BookingEmiConfig config) {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.AVAILABLE, price)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithId(ASSOCIATE_ID)));
        when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.of(config));
        when(plotBookingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(emiInstallmentRepository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void createBookingAcquiresTheRowLockOnThePlotViaFindByIdForUpdateNotFindById() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(plotRepository).findByIdForUpdate(PLOT_ID);
        verify(plotRepository, never()).findById(any());
    }

    @Test
    void createBookingThrowsPlotNotFoundExceptionWhenThePlotDoesNotExist() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void createBookingThrowsPlotNotAvailableExceptionWhenThePlotIsAlreadyBooked() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.BOOKED, "600000.00")));

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void createBookingThrowsPlotNotAvailableExceptionWhenThePlotIsAlreadySold() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.SOLD, "600000.00")));

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);
    }

    @Test
    void createBookingThrowsAssociateNotFoundExceptionWhenTheAssociateDoesNotExist() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.AVAILABLE, "600000.00")));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void createBookingThrowsIllegalStateExceptionWhenTheBookingEmiConfigRowIsMissing() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.AVAILABLE, "600000.00")));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithId(ASSOCIATE_ID)));
        when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(IllegalStateException.class);

        verify(plotBookingRepository, never()).save(any());
    }

    @Test
    void createBookingPersistsBuyerDetailsAndStartsActive() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<PlotBooking> captor = ArgumentCaptor.forClass(PlotBooking.class);
        verify(plotBookingRepository).save(captor.capture());
        assertThat(captor.getValue().getBuyerName()).isEqualTo("Jane Buyer");
        assertThat(captor.getValue().getBuyerPhone()).isEqualTo("9999999999");
        assertThat(captor.getValue().getStatus()).isEqualTo(BookingStatus.ACTIVE);
    }

    @Test
    void createBookingStoresABlankBuyerPhoneAsNull() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(new CreateBookingRequest(PLOT_ID, ASSOCIATE_ID, "Jane Buyer", "   "));

        ArgumentCaptor<PlotBooking> captor = ArgumentCaptor.forClass(PlotBooking.class);
        verify(plotBookingRepository).save(captor.capture());
        assertThat(captor.getValue().getBuyerPhone()).isNull();
    }

    @Test
    void createBookingStampsBookedAtFromTheInjectedClock() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.bookedAt()).isEqualTo(NOW);
    }

    @Test
    void createBookingFlipsThePlotToBooked() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.BOOKED);
    }

    @Test
    void createBookingSavesABookingWithTotalAmountAndInstallmentCountSnapshotted() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<PlotBooking> captor = ArgumentCaptor.forClass(PlotBooking.class);
        verify(plotBookingRepository).save(captor.capture());
        PlotBooking saved = captor.getValue();
        assertThat(saved.getPlotId()).isEqualTo(PLOT_ID);
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getTotalAmount()).isEqualByComparingTo("600000.00");
        assertThat(saved.getInstallmentCount()).isEqualTo(4);
        assertThat(saved.getBookedAt()).isNotNull();
    }

    // Flat, no-interest amortization: BookingEmiConfig has no down-payment or interest-rate
    // field, so an evenly-divisible total splits into exactly-equal installments.
    @Test
    void createBookingGeneratesEqualInstallmentsWhenTheAmountDividesEvenly() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installments()).hasSize(4);
        assertThat(response.installments()).allSatisfy(i ->
            assertThat(i.amount()).isEqualByComparingTo("150000.00"));
        BigDecimal sum = response.installments().stream()
            .map(EmiInstallmentResponse::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sum).isEqualByComparingTo("600000.00");
    }

    // The DOWN-rounded per-installment amount times (count - 1) leaves a remainder; the last
    // installment absorbs it so the schedule's total always equals the plot price exactly.
    @Test
    void createBookingLastInstallmentAbsorbsTheRoundingRemainder() {
        stubHappyPathGuardsAndDependencies("100000.00", emiConfig(true, 3));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installments()).hasSize(3);
        assertThat(response.installments().get(0).amount()).isEqualByComparingTo("33333.33");
        assertThat(response.installments().get(1).amount()).isEqualByComparingTo("33333.33");
        assertThat(response.installments().get(2).amount()).isEqualByComparingTo("33333.34");
        BigDecimal sum = response.installments().stream()
            .map(EmiInstallmentResponse::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sum).isEqualByComparingTo("100000.00");
    }

    @Test
    void createBookingGeneratesASingleInstallmentForTheFullAmountWhenEmiIsDisabled() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(false, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installmentCount()).isEqualTo(1);
        assertThat(response.installments()).hasSize(1);
        assertThat(response.installments().get(0).amount()).isEqualByComparingTo("600000.00");
        assertThat(response.installments().get(0).installmentNumber()).isEqualTo(1);
    }

    @Test
    void createBookingSpacesInstallmentDueDatesOneMonthApartStartingOneMonthAfterBooking() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 3));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        LocalDate bookedDate = response.bookedAt().atZone(ZoneOffset.UTC).toLocalDate();
        assertThat(response.installments().get(0).dueDate()).isEqualTo(bookedDate.plusMonths(1));
        assertThat(response.installments().get(1).dueDate()).isEqualTo(bookedDate.plusMonths(2));
        assertThat(response.installments().get(2).dueDate()).isEqualTo(bookedDate.plusMonths(3));
    }

    @Test
    void createBookingInstallmentNumbersAreOneBasedAndSequential() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 3));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installments()).extracting(EmiInstallmentResponse::installmentNumber)
            .containsExactly(1, 2, 3);
    }

    @Test
    void createBookingPersistsTheGeneratedScheduleViaSaveAll() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 3));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<List<EmiInstallment>> captor = ArgumentCaptor.forClass(List.class);
        verify(emiInstallmentRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(3);
        assertThat(captor.getValue()).allSatisfy(i -> assertThat(i.getBookingId()).isNotNull());
    }

    @Test
    void createBookingReturnsAFullyPopulatedBookingResponse() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.id()).isNotNull();
        assertThat(response.plotId()).isEqualTo(PLOT_ID);
        assertThat(response.associateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(response.totalAmount()).isEqualByComparingTo("600000.00");
        assertThat(response.installmentCount()).isEqualTo(4);
        assertThat(response.bookedAt()).isNotNull();
        assertThat(response.installments()).hasSize(4);
    }

    @Test
    void getMyBookingsFiltersByTheGivenAssociateIdOnly() {
        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(PLOT_ID);
        booking.setAssociateId(ASSOCIATE_ID);
        booking.setTotalAmount(new BigDecimal("600000.00"));
        booking.setInstallmentCount(1);
        booking.setBookedAt(Instant.now());
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(
            eq(ASSOCIATE_ID), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(booking), PageRequest.of(0, 20), 1));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(List.of());

        AssociateBookingPageResponse response = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20);

        verify(plotBookingRepository).findByAssociateIdOrderByBookedAtDesc(ASSOCIATE_ID, PageRequest.of(0, 20));
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.bookings()).hasSize(1);
        assertThat(response.bookings().get(0).id()).isEqualTo(booking.getId());
    }

    @Test
    void getMyBookingsAttachesEachBookingsEmiScheduleFromTheInstallmentRepository() {
        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(PLOT_ID);
        booking.setAssociateId(ASSOCIATE_ID);
        booking.setTotalAmount(new BigDecimal("600000.00"));
        booking.setInstallmentCount(2);
        booking.setBookedAt(Instant.now());
        EmiInstallment first = new EmiInstallment();
        first.setInstallmentNumber(1);
        first.setAmount(new BigDecimal("300000.00"));
        first.setDueDate(LocalDate.now().plusMonths(1));
        EmiInstallment second = new EmiInstallment();
        second.setInstallmentNumber(2);
        second.setAmount(new BigDecimal("300000.00"));
        second.setDueDate(LocalDate.now().plusMonths(2));
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(eq(ASSOCIATE_ID), any()))
            .thenReturn(new PageImpl<>(List.of(booking), PageRequest.of(0, 20), 1));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(List.of(first, second));

        AssociateBookingPageResponse response = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20);

        assertThat(response.bookings().get(0).installments()).hasSize(2);
        assertThat(response.bookings().get(0).installments().get(0).amount()).isEqualByComparingTo("300000.00");
    }

    @Test
    void getMyBookingsReturnsAnEmptyPageWhenTheCallerHasNoBookings() {
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(eq(ASSOCIATE_ID), any()))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateBookingPageResponse response = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        assertThat(response.bookings()).isEmpty();
    }

    private static final UUID ACTOR_ID = UUID.randomUUID();

    private PlotBooking lockedBookingWith(EmiInstallment... installments) {
        PlotBooking booking = bookingWithBuyer();
        when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(List.of(installments));
        return booking;
    }

    private RecordPaymentRequest pay(String amount) {
        return new RecordPaymentRequest(new BigDecimal(amount), "UTR-1", null);
    }

    @Test
    void recordPaymentMarksInstallmentPaidStampsFieldsWritesEventAndReturnsUpdatedBooking() {
        EmiInstallment i1 = installment(1, "100000.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        EmiInstallment i2 = installment(2, "100000.00", LocalDate.of(2026, 8, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1, i2);

        BookingResponse response = bookingService.recordPayment(booking.getId(), 1, pay("100000"), ACTOR_ID);

        assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PAID);
        assertThat(i1.getPaidAt()).isEqualTo(NOW);              // paidAt omitted -> Clock now
        assertThat(i1.getPaymentRef()).isEqualTo("UTR-1");
        assertThat(i1.getRecordedBy()).isEqualTo(ACTOR_ID);
        assertThat(i2.getStatus()).isEqualTo(InstallmentStatus.PENDING);
        verify(emiInstallmentRepository).save(i1);

        ArgumentCaptor<BookingEvent> event = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(event.capture());
        assertThat(event.getValue().getType()).isEqualTo(BookingEventType.PAID);
        assertThat(event.getValue().getBookingId()).isEqualTo(booking.getId());
        assertThat(event.getValue().getActorId()).isEqualTo(ACTOR_ID);
        assertThat(event.getValue().getCreatedAt()).isEqualTo(NOW);
        assertThat(event.getValue().getDetail()).contains("1").contains("100000").contains("UTR-1");

        assertThat(response.paidAmount()).isEqualByComparingTo("100000.00");
        assertThat(response.dueAmount()).isEqualByComparingTo("100000.00");
        assertThat(response.installments().get(0).status()).isEqualTo(InstallmentStatus.PAID);
    }

    @Test
    void recordPaymentUsesSuppliedPaidAtAndTrimsPaymentRef() {
        EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1);
        Instant earlier = Instant.parse("2026-06-10T08:00:00Z");

        bookingService.recordPayment(booking.getId(), 1,
            new RecordPaymentRequest(new BigDecimal("100.00"), "  UTR-9  ", earlier), ACTOR_ID);

        assertThat(i1.getPaidAt()).isEqualTo(earlier);
        assertThat(i1.getPaymentRef()).isEqualTo("UTR-9");
    }

    @Test
    void recordPaymentDoesNotRequireEarlierInstallmentsToBePaid() {
        EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        EmiInstallment i3 = installment(3, "100.00", LocalDate.of(2026, 9, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1, i3);

        bookingService.recordPayment(booking.getId(), 3, pay("100.00"), ACTOR_ID);

        assertThat(i3.getStatus()).isEqualTo(InstallmentStatus.PAID);
        assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PENDING);
    }

    @Test
    void recordPaymentOnAPastDueInstallmentClearsItsOverdueFlag() {
        EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 6, 1), InstallmentStatus.PENDING); // before NOW
        PlotBooking booking = lockedBookingWith(i1);

        BookingResponse response = bookingService.recordPayment(booking.getId(), 1, pay("100.00"), ACTOR_ID);

        assertThat(response.installments().get(0).overdue()).isFalse();
    }

    @Test
    void recordPaymentOnUnknownBookingIs404AndWritesNothing() {
        UUID id = UUID.randomUUID();
        when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.recordPayment(id, 1, pay("1"), ACTOR_ID))
            .isInstanceOf(BookingNotFoundException.class);
        verify(bookingEventRepository, never()).save(any());
        verify(emiInstallmentRepository, never()).save(any());
    }

    @Test
    void recordPaymentOnNonActiveBookingIs409BeforeLookingAtInstallments() {
        for (BookingStatus status : List.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)) {
            PlotBooking booking = bookingWithBuyer();
            booking.setStatus(status);
            when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

            assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("1"), ACTOR_ID))
                .isInstanceOf(BookingNotActiveException.class);
        }
        verify(emiInstallmentRepository, never()).findByBookingIdOrderByInstallmentNumberAsc(any());
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void recordPaymentOnUnknownInstallmentNumberIs404() {
        PlotBooking booking = lockedBookingWith(
            installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING));

        assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 9, pay("100.00"), ACTOR_ID))
            .isInstanceOf(InstallmentNotFoundException.class);
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void recordPaymentOnPaidOrVoidInstallmentIs409AndLeavesItUntouched() {
        for (InstallmentStatus status : List.of(InstallmentStatus.PAID, InstallmentStatus.VOID)) {
            EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), status);
            i1.setPaymentRef("original");
            PlotBooking booking = lockedBookingWith(i1);

            assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("100.00"), ACTOR_ID))
                .isInstanceOf(InstallmentNotPayableException.class);
            assertThat(i1.getStatus()).isEqualTo(status);
            assertThat(i1.getPaymentRef()).isEqualTo("original");
        }
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void recordPaymentWithWrongAmountIs400AndLeavesInstallmentPending() {
        EmiInstallment i1 = installment(1, "100000.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1);

        assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("99999.99"), ACTOR_ID))
            .isInstanceOf(PaymentAmountMismatchException.class);
        assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PENDING);
        assertThat(i1.getRecordedBy()).isNull();
        verify(emiInstallmentRepository, never()).save(any());
        verify(bookingEventRepository, never()).save(any());
    }

    private Plot plotWithStatus(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private SaleResponse saleResponse(UUID saleId) {
        return new SaleResponse(saleId, PLOT_ID, ASSOCIATE_ID, "Jane Buyer", null, null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, NOW,
            "A-101", "Green Valley", "u1", "Test Associate", "note");
    }

    // Booking locked + ACTIVE (bookingWithBuyer defaults status ACTIVE), plot locked with given status.
    private PlotBooking lockedBookingAndPlot(PlotStatus plotStatus, UUID saleId) {
        PlotBooking booking = bookingWithBuyer();
        when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        Plot plot = plotWithStatus(plotStatus);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plot));
        if (saleId != null) {
            when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
                .thenReturn(List.of());
            when(saleService.recordConfirmedBooking(any(), any(), any(), any(), any(), any()))
                .thenReturn(saleResponse(saleId));
        }
        return booking;
    }

    @Test
    void confirmBookingCreatesSaleFromBookingFieldsStampsBookingAndWritesConfirmedEvent() {
        UUID saleId = UUID.randomUUID();
        PlotBooking booking = lockedBookingAndPlot(PlotStatus.BOOKED, saleId);
        booking.setBuyerPhone("999");

        BookingResponse response = bookingService.confirmBooking(booking.getId(), ACTOR_ID);

        verify(saleService).recordConfirmedBooking(eq(booking.getId()), eq(ASSOCIATE_ID),
            eq("Jane Buyer"), eq("999"), eq(new BigDecimal("600000.00")), any(Plot.class));
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(booking.getConfirmedAt()).isEqualTo(NOW);
        assertThat(booking.getSaleId()).isEqualTo(saleId);
        verify(plotBookingRepository).save(booking);

        ArgumentCaptor<BookingEvent> event = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(event.capture());
        assertThat(event.getValue().getType()).isEqualTo(BookingEventType.CONFIRMED);
        assertThat(event.getValue().getBookingId()).isEqualTo(booking.getId());
        assertThat(event.getValue().getActorId()).isEqualTo(ACTOR_ID);
        assertThat(event.getValue().getCreatedAt()).isEqualTo(NOW);
        assertThat(event.getValue().getDetail()).contains(saleId.toString()).contains("600000");
        assertThat(response.status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    void confirmBookingLocksTheBookingBeforeThePlotAndNeverUsesAnUnlockedFind() {
        PlotBooking booking = lockedBookingAndPlot(PlotStatus.BOOKED, UUID.randomUUID());

        bookingService.confirmBooking(booking.getId(), ACTOR_ID);

        InOrder order = inOrder(plotBookingRepository, plotRepository);
        order.verify(plotBookingRepository).findByIdForUpdate(booking.getId());
        order.verify(plotRepository).findByIdForUpdate(PLOT_ID);
        verify(plotRepository, never()).findById(any());
    }

    @Test
    void confirmBookingOnUnknownBookingIs404AndTouchesNothingElse() {
        UUID id = UUID.randomUUID();
        when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.confirmBooking(id, ACTOR_ID))
            .isInstanceOf(BookingNotFoundException.class);
        verifyNoInteractions(plotRepository, saleService, bookingEventRepository);
    }

    @Test
    void confirmBookingOnNonActiveBookingIs409BeforeLockingThePlot() {
        for (BookingStatus status : List.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)) {
            PlotBooking booking = bookingWithBuyer();
            booking.setStatus(status);
            when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

            assertThatThrownBy(() -> bookingService.confirmBooking(booking.getId(), ACTOR_ID))
                .isInstanceOf(BookingNotActiveException.class);
            assertThat(booking.getStatus()).isEqualTo(status);
        }
        verifyNoInteractions(plotRepository, saleService, bookingEventRepository);
    }

    @Test
    void confirmBookingWithANonBookedPlotThrowsBookingPlotNotAvailableAndChangesNothing() {
        for (PlotStatus status : List.of(PlotStatus.AVAILABLE, PlotStatus.SOLD)) {
            PlotBooking booking = lockedBookingAndPlot(status, null);

            assertThatThrownBy(() -> bookingService.confirmBooking(booking.getId(), ACTOR_ID))
                .isInstanceOf(PlotNotAvailableException.class);   // booking.PlotNotAvailableException -> 409
            assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);
            assertThat(booking.getSaleId()).isNull();
        }
        verifyNoInteractions(saleService, bookingEventRepository);
    }

    // Decision 1: manual confirm is never gated by confirmRule/threshold, so it never reads the config.
    @Test
    void confirmBookingNeverConsultsTheEmiConfigSoItIsAllowedUnderBothRules() {
        PlotBooking booking = lockedBookingAndPlot(PlotStatus.BOOKED, UUID.randomUUID());

        bookingService.confirmBooking(booking.getId(), ACTOR_ID);

        verifyNoInteractions(bookingEmiConfigRepository);
    }
}
