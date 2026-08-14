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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class BookingService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;
    private final BookingEmiConfigRepository bookingEmiConfigRepository;
    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;

    public BookingService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            BookingEmiConfigRepository bookingEmiConfigRepository,
            PlotBookingRepository plotBookingRepository,
            EmiInstallmentRepository emiInstallmentRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.bookingEmiConfigRepository = bookingEmiConfigRepository;
        this.plotBookingRepository = plotBookingRepository;
        this.emiInstallmentRepository = emiInstallmentRepository;
    }

    // Row-lock the Plot first, same fix Sales unit 3's pre-merge code review forced onto
    // SaleService.recordSale (PlotRepository.findByIdForUpdate's own comment) -- two concurrent
    // bookings against the same plot must not both pass the AVAILABLE check before either
    // commits. See BookingConcurrencyTest for the end-to-end proof.
    @Transactional
    public BookingResponse createBooking(CreateBookingRequest request) {
        Plot plot = plotRepository.findByIdForUpdate(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Plot -> BOOKED, not SOLD: a booking reserves the plot under an installment plan, it
        // doesn't complete a sale. A BOOKED plot still fails the AVAILABLE check above (and
        // SaleService.recordSale's own AVAILABLE check), so it can't be independently booked or
        // sold again -- the plot-inventory-integrity requirement this unit exists to satisfy,
        // for free, from the AVAILABLE check that already exists.
        plot.setStatus(PlotStatus.BOOKED);
        plotRepository.save(plot);

        BookingEmiConfig config = bookingEmiConfigRepository.findBySingletonGuardTrue()
            .orElseThrow(() -> new IllegalStateException(
                "booking_emi_config row missing - V14 migration seeds it"));

        Instant bookedAt = Instant.now();
        List<EmiInstallment> schedule = computeSchedule(plot.getPrice(), config, bookedAt);

        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(plot.getId());
        booking.setAssociateId(associate.getId());
        booking.setTotalAmount(plot.getPrice());
        booking.setInstallmentCount(schedule.size());
        booking.setBookedAt(bookedAt);
        booking = plotBookingRepository.save(booking);

        for (EmiInstallment installment : schedule) {
            installment.setBookingId(booking.getId());
        }
        emiInstallmentRepository.saveAll(schedule);

        return toResponse(booking, schedule);
    }

    // Self-scoped only, unlike Sales' getMySales -- the data visibility matrix's Plot/project
    // inventory row gives an Associate "own bookings + EMI schedule", not "own + descendant"
    // like the Sales row's explicit "team-volume reports" wording. No AssociateRepository
    // downline resolution needed here.
    public AssociateBookingPageResponse getMyBookings(UUID associateId, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(
            associateId, PageRequest.of(page, size));

        List<BookingResponse> bookings = result.getContent().stream()
            .map(booking -> toResponse(booking, emiInstallmentRepository
                .findByBookingIdOrderByInstallmentNumberAsc(booking.getId())))
            .toList();

        return new AssociateBookingPageResponse(bookings, page, size, result.getTotalElements());
    }

    // Flat, no-interest amortization: BookingEmiConfig carries no down-payment-percentage or
    // interest-rate field (only emiEnabled, defaultInstallmentCount, confirmRule,
    // confirmThresholdPercent -- confirmed by reading the entity directly, not assumed), so
    // there is nothing to compound or front-load. When EMI is disabled, the schedule is a single
    // installment for the full amount, still due one month out -- the same formula as every
    // other case below, deliberately not special-cased to a due-today date, so there's one
    // schedule shape for a future payment-recording unit to reason about, not two.
    private List<EmiInstallment> computeSchedule(BigDecimal totalAmount, BookingEmiConfig config, Instant bookedAt) {
        int count = config.isEmiEnabled() ? config.getDefaultInstallmentCount() : 1;
        LocalDate bookedDate = bookedAt.atZone(ZoneOffset.UTC).toLocalDate();
        BigDecimal base = totalAmount.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);

        List<EmiInstallment> schedule = new ArrayList<>();
        BigDecimal runningTotal = BigDecimal.ZERO;
        for (int i = 1; i < count; i++) {
            EmiInstallment installment = new EmiInstallment();
            installment.setId(UUID.randomUUID());
            installment.setInstallmentNumber(i);
            installment.setAmount(base);
            installment.setDueDate(bookedDate.plusMonths(i));
            schedule.add(installment);
            runningTotal = runningTotal.add(base);
        }

        // Last installment absorbs whatever the DOWN rounding above left behind, so the
        // schedule's total always equals totalAmount exactly, never a cent short or over.
        EmiInstallment last = new EmiInstallment();
        last.setId(UUID.randomUUID());
        last.setInstallmentNumber(count);
        last.setAmount(totalAmount.subtract(runningTotal));
        last.setDueDate(bookedDate.plusMonths(count));
        schedule.add(last);

        return schedule;
    }

    private BookingResponse toResponse(PlotBooking booking, List<EmiInstallment> installments) {
        List<EmiInstallmentResponse> installmentResponses = installments.stream()
            .map(i -> new EmiInstallmentResponse(i.getInstallmentNumber(), i.getAmount(), i.getDueDate()))
            .toList();
        return new BookingResponse(
            booking.getId(),
            booking.getPlotId(),
            booking.getAssociateId(),
            booking.getTotalAmount(),
            booking.getInstallmentCount(),
            booking.getBookedAt(),
            installmentResponses
        );
    }
}
