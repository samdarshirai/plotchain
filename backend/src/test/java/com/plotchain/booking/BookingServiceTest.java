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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;

    BookingService bookingService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository);
    }

    private Plot plotWithStatusAndPrice(PlotStatus status, String price) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal(price), status);
    }

    private CreateBookingRequest requestFor(UUID plotId, UUID associateId) {
        return new CreateBookingRequest(plotId, associateId);
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
}
