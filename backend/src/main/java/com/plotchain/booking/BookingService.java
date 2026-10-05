package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class BookingService {

    private final PlotRepository plotRepository;
    private final ProjectRepository projectRepository;
    private final AssociateRepository associateRepository;
    private final BookingEmiConfigRepository bookingEmiConfigRepository;
    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;
    private final BookingEventRepository bookingEventRepository;
    private final SaleService saleService;
    private final Clock clock;

    public BookingService(
            PlotRepository plotRepository,
            ProjectRepository projectRepository,
            AssociateRepository associateRepository,
            BookingEmiConfigRepository bookingEmiConfigRepository,
            PlotBookingRepository plotBookingRepository,
            EmiInstallmentRepository emiInstallmentRepository,
            BookingEventRepository bookingEventRepository,
            SaleService saleService,
            Clock clock) {
        this.saleService = saleService;
        this.clock = clock;
        this.bookingEventRepository = bookingEventRepository;
        this.plotRepository = plotRepository;
        this.projectRepository = projectRepository;
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

        BigDecimal token = request.tokenAmount();
        if (token.compareTo(plot.getPrice()) >= 0) {
            throw new InvalidTokenAmountException(token, plot.getPrice());
        }

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

        Instant bookedAt = clock.instant();
        List<EmiInstallment> schedule = computeSchedule(plot.getPrice(), token, config, bookedAt);

        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(plot.getId());
        booking.setAssociateId(associate.getId());
        booking.setTotalAmount(plot.getPrice());
        booking.setInstallmentCount(schedule.size());
        booking.setBookedAt(bookedAt);
        booking.setBuyerName(request.buyerName().trim());
        booking.setBuyerPhone(request.buyerPhone() == null || request.buyerPhone().isBlank()
            ? null : request.buyerPhone().trim());
        booking.setStatus(BookingStatus.ACTIVE);
        booking = plotBookingRepository.save(booking);

        for (EmiInstallment installment : schedule) {
            installment.setBookingId(booking.getId());
        }
        emiInstallmentRepository.saveAll(schedule);

        return toResponse(booking, schedule);
    }

    // Row-locks the booking FIRST (Decision 8) so two simultaneous pays on one installment
    // serialize: the loser re-reads the installment as PAID and gets 409. Check order is the
    // spec's Flow "Record payment". Installments are deliberately payable in any order.
    @Transactional
    public BookingResponse recordPayment(UUID bookingId, int installmentNumber,
                                         RecordPaymentRequest request, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }

        List<EmiInstallment> installments =
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId);
        EmiInstallment installment = installments.stream()
            .filter(i -> i.getInstallmentNumber() == installmentNumber)
            .findFirst()
            .orElseThrow(() -> new InstallmentNotFoundException(bookingId, installmentNumber));
        if (installment.getStatus() != InstallmentStatus.PENDING) {
            throw new InstallmentNotPayableException(bookingId, installmentNumber);
        }
        // compareTo, not equals: 100000 and 100000.00 are the same money.
        if (request.amount().compareTo(installment.getAmount()) != 0) {
            throw new PaymentAmountMismatchException(bookingId, installmentNumber, installment.getAmount());
        }

        Instant now = clock.instant();
        String paymentRef = request.paymentRef().trim();
        installment.setStatus(InstallmentStatus.PAID);
        installment.setPaidAt(request.paidAt() != null ? request.paidAt() : now);
        installment.setPaymentRef(paymentRef);
        installment.setRecordedBy(actorId);
        emiInstallmentRepository.save(installment);

        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.PAID, actorId,
            "installment " + installmentNumber + ", amount " + installment.getAmount().toPlainString()
                + ", ref " + paymentRef, now));

        afterInstallmentPaid(booking, installments, actorId);
        return toResponse(booking, installments);
    }

    // Unit 5: AUTO_THRESHOLD auto-confirm (spec Decision 1, Flow "Record payment"). Runs inside
    // recordPayment's locked transaction, after the PAID event and before the response is built, so
    // the response reflects a CONFIRMED booking. Holds only the booking lock; confirmLocked takes the
    // plot lock itself (booking -> plot, Decision 8). Any failure in confirmLocked propagates and
    // rolls the whole pay back (installment write + PAID event included).
    // Config is read fresh from the global singleton every call (Resolved decision #3): no snapshot.
    void afterInstallmentPaid(PlotBooking booking, List<EmiInstallment> installments, UUID actorId) {
        BookingEmiConfig config = bookingEmiConfigRepository.findBySingletonGuardTrue()
            .orElseThrow(() -> new IllegalStateException(
                "booking_emi_config row missing - V14 migration seeds it"));
        if (thresholdReached(booking, installments, config)) {
            confirmLocked(booking, actorId);
        }
    }

    // `installments` already contains the just-paid row as PAID (recordPayment mutates the same
    // object that is in this list). Exact math, no division: paid/total >= threshold/100
    // <=> paid*100 >= total*threshold. Only the literal AUTO_THRESHOLD rule qualifies (MANUAL and
    // KYC_GATED never auto-confirm); a null/<=0 threshold never confirms rather than blocking the pay.
    private boolean thresholdReached(PlotBooking booking, List<EmiInstallment> installments,
                                     BookingEmiConfig config) {
        if (!"AUTO_THRESHOLD".equals(config.getConfirmRule())) {
            return false;
        }
        Integer threshold = config.getConfirmThresholdPercent();
        BigDecimal total = booking.getTotalAmount();
        if (threshold == null || threshold <= 0 || total.signum() <= 0) {
            return false;
        }
        BigDecimal paid = sumByStatus(installments, InstallmentStatus.PAID);
        return paid.multiply(BigDecimal.valueOf(100))
            .compareTo(total.multiply(BigDecimal.valueOf(threshold))) >= 0;
    }

    // Plot-booking unit 4 (spec Flow "Confirm", Decisions 1, 2, 8). Locks the booking FIRST (so two
    // simultaneous confirms serialize: the loser re-reads CONFIRMED and gets 409 -- the unique
    // sale.booking_id index is only the backstop), then confirmLocked takes the plot lock.
    // Allowed under MANUAL and AUTO_THRESHOLD alike: never reads booking_emi_config (Decision 1).
    @Transactional
    public BookingResponse confirmBooking(UUID bookingId, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        confirmLocked(booking, actorId);
        return toResponse(booking, emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
    }

    // Reusable confirm step; unit 5 calls this from afterInstallmentPaid inside recordPayment's
    // transaction. PRECONDITIONS (not re-checked): caller is inside a transaction, already holds the
    // booking row lock (findByIdForUpdate) and has verified status == ACTIVE.
    // LOCK ORDER IS BOOKING -> PLOT EVERYWHERE (Decision 8): never take a plot lock and then a
    // booking lock, or concurrent confirm/cancel/pay can deadlock. The plot lock is taken here so
    // callers cannot forget it or get the order wrong.
    void confirmLocked(PlotBooking lockedBooking, UUID actorId) {
        Plot plot = plotRepository.findByIdForUpdate(lockedBooking.getPlotId())
            .orElseThrow(() -> new IllegalStateException(
                "plot row missing for booking " + lockedBooking.getId() + " - plot_id has an FK constraint"));
        // Checked here (not left to SaleService.recordConfirmedBooking's identical guard) so the
        // failure is the booking-flavoured PlotNotAvailableException (409), not a sales exception.
        if (plot.getStatus() != PlotStatus.BOOKED) {
            throw new PlotNotAvailableException(plot.getId());
        }

        // Flips the plot BOOKED -> SOLD and sets sale.booking_id itself.
        SaleResponse sale = saleService.recordConfirmedBooking(
            lockedBooking.getId(), lockedBooking.getAssociateId(), lockedBooking.getBuyerName(),
            lockedBooking.getBuyerPhone(), lockedBooking.getTotalAmount(), plot);

        Instant now = clock.instant();
        lockedBooking.setStatus(BookingStatus.CONFIRMED);
        lockedBooking.setConfirmedAt(now);
        lockedBooking.setSaleId(sale.id());
        plotBookingRepository.save(lockedBooking);

        bookingEventRepository.save(BookingEvent.of(lockedBooking.getId(), BookingEventType.CONFIRMED,
            actorId, "sale " + sale.id() + ", amount " + lockedBooking.getTotalAmount().toPlainString(), now));
    }

    // Plot-booking unit 6 (spec Flow "Cancel", Decisions 4, 8). Locks the booking FIRST so a concurrent
    // pay / confirm / cancel serializes on it (the loser re-reads CANCELLED/CONFIRMED and gets 409),
    // then the plot. LOCK ORDER IS BOOKING -> PLOT EVERYWHERE (Decision 8), same as confirmLocked.
    // PAID installments are untouched; PENDING -> VOID; amounts retained as a note only (no refunds).
    // The plot goes BOOKED -> AVAILABLE only if it is BOOKED and no other ACTIVE/CONFIRMED booking
    // holds it (see the stale-booking guard below). Any other plot state is drift: cancel must stay
    // possible (it is the repair tool, unlike confirm which 409s on drift), and flipping a SOLD plot
    // to AVAILABLE would let it be sold twice. Drift is recorded in the event detail instead.
    // Reason + paid total live in booking_event.detail (Resolved decision #2).
    @Transactional
    public BookingResponse cancelBooking(UUID bookingId, CancelBookingRequest request, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        Plot plot = plotRepository.findByIdForUpdate(booking.getPlotId())
            .orElseThrow(() -> new IllegalStateException(
                "plot row missing for booking " + bookingId + " - plot_id has an FK constraint"));

        List<EmiInstallment> installments =
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId);
        for (EmiInstallment installment : installments) {
            if (installment.getStatus() == InstallmentStatus.PENDING) {
                installment.setStatus(InstallmentStatus.VOID);
            }
        }
        emiInstallmentRepository.saveAll(installments);

        String plotNote = "";
        if (plot.getStatus() == PlotStatus.BOOKED) {
            // Stale-booking guard: runs under the booking + plot locks. If the plot drifted and another
            // live booking now holds it, freeing it would double-sell it; keep it and say so.
            Optional<PlotBooking> holder = plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
                plot.getId(), bookingId, List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED));
            if (holder.isPresent()) {
                plotNote = "; plot kept: held by booking " + holder.get().getId();
            } else {
                plot.setStatus(PlotStatus.AVAILABLE);
                plotRepository.save(plot);
            }
        } else {
            plotNote = "; plot left " + plot.getStatus();
        }

        Instant now = clock.instant();
        String reason = request.reason().trim();
        booking.setStatus(BookingStatus.CANCELLED);
        booking.setCancelledAt(now);
        booking.setCancelReason(reason);
        plotBookingRepository.save(booking);

        BigDecimal paid = sumByStatus(installments, InstallmentStatus.PAID).setScale(2, RoundingMode.HALF_UP);
        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.CANCELLED, actorId,
            "reason: " + reason + "; paid: " + paid.toPlainString() + plotNote, now));

        return toResponse(booking, installments);
    }

    // Plot-booking unit 7 (spec Flow "Transfer", Decisions 5, 8). Locks the booking FIRST so a transfer
    // racing pay/confirm/cancel serializes on the row. Guard order, all before the first write so every
    // 4xx leaves the database untouched: booking 404 -> not ACTIVE 409 -> same associate 400 ->
    // target 404 -> target not ACTIVE 400 (Resolved decision #4). Installments, payments and the plot
    // are not touched. A later confirm credits whoever owns the booking at confirm time (confirmLocked
    // reads booking.getAssociateId()).
    @Transactional
    public BookingResponse transferBooking(UUID bookingId, UUID targetAssociateId, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        UUID fromAssociateId = booking.getAssociateId();
        if (fromAssociateId.equals(targetAssociateId)) {
            throw new SameAssociateTransferException(targetAssociateId);
        }
        Associate target = associateRepository.findById(targetAssociateId)
            .orElseThrow(() -> new AssociateNotFoundException(targetAssociateId));
        if (target.getStatus() != AssociateStatus.ACTIVE) {
            throw new InvalidTransferTargetException(targetAssociateId, target.getStatus());
        }

        booking.setAssociateId(targetAssociateId);
        plotBookingRepository.save(booking);
        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.TRANSFERRED, actorId,
            "from " + fromAssociateId + " to " + targetAssociateId, clock.instant()));

        return toResponse(booking, emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
    }

    // Plot-booking unit 14a: admin reads one booking (any status) with installments and derived overdue.
    public BookingResponse getBooking(UUID bookingId) {
        PlotBooking booking = plotBookingRepository.findById(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        return toResponse(booking, emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
    }

    // Self-scoped only, unlike Sales' getMySales -- the data visibility matrix's Plot/project
    // inventory row gives an Associate "own bookings + EMI schedule", not "own + descendant"
    // like the Sales row's explicit "team-volume reports" wording. No AssociateRepository
    // downline resolution needed here.
    public AssociateBookingPageResponse getMyBookings(UUID associateId, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(
            associateId, PageRequest.of(page, size));

        List<BookingResponse> bookings = toResponses(result.getContent(), emiInstallmentRepository
            .findByBookingIdInOrderByInstallmentNumberAsc(
                result.getContent().stream().map(PlotBooking::getId).toList()).stream()
            .collect(java.util.stream.Collectors.groupingBy(EmiInstallment::getBookingId)));

        return new AssociateBookingPageResponse(bookings, page, size, result.getTotalElements());
    }

    // Flat, no-interest amortization: BookingEmiConfig carries no down-payment-percentage or
    // interest-rate field (only emiEnabled, defaultInstallmentCount, confirmRule,
    // confirmThresholdPercent -- confirmed by reading the entity directly, not assumed), so
    // there is nothing to compound or front-load. When EMI is disabled, the schedule is a single
    // installment for the full amount, still due one month out -- the same formula as every
    // other case below, deliberately not special-cased to a due-today date, so there's one
    // schedule shape for a future payment-recording unit to reason about, not two.
    // Installment 1 is the token, PAID at booking time. The rest of the price (total - token) splits
    // equally across the other installments: the configured count less the token's slot, and at
    // least one (so with EMI off the schedule is token + one balance installment).
    private List<EmiInstallment> computeSchedule(BigDecimal totalAmount, BigDecimal token,
                                                 BookingEmiConfig config, Instant bookedAt) {
        int count = config.isEmiEnabled() ? config.getDefaultInstallmentCount() : 1;
        int balanceCount = Math.max(count - 1, 1);
        LocalDate bookedDate = bookedAt.atZone(ZoneOffset.UTC).toLocalDate();
        BigDecimal balance = totalAmount.subtract(token);
        BigDecimal base = balance.divide(BigDecimal.valueOf(balanceCount), 2, RoundingMode.DOWN);

        List<EmiInstallment> schedule = new ArrayList<>();
        EmiInstallment tokenInstallment = new EmiInstallment();
        tokenInstallment.setId(UUID.randomUUID());
        tokenInstallment.setInstallmentNumber(1);
        tokenInstallment.setAmount(token);
        tokenInstallment.setDueDate(bookedDate);
        tokenInstallment.setStatus(InstallmentStatus.PAID);
        tokenInstallment.setPaidAt(bookedAt);
        tokenInstallment.setPaymentRef("TOKEN");
        schedule.add(tokenInstallment);

        BigDecimal runningTotal = BigDecimal.ZERO;
        for (int i = 1; i < balanceCount; i++) {
            EmiInstallment installment = new EmiInstallment();
            installment.setId(UUID.randomUUID());
            installment.setInstallmentNumber(i + 1);
            installment.setAmount(base);
            installment.setDueDate(bookedDate.plusMonths(i));
            schedule.add(installment);
            runningTotal = runningTotal.add(base);
        }

        // Last installment absorbs whatever the DOWN rounding above left behind, so the
        // schedule's total always equals totalAmount exactly, never a cent short or over.
        EmiInstallment last = new EmiInstallment();
        last.setId(UUID.randomUUID());
        last.setInstallmentNumber(balanceCount + 1);
        last.setAmount(balance.subtract(runningTotal));
        last.setDueDate(bookedDate.plusMonths(balanceCount));
        schedule.add(last);

        return schedule;
    }

    // Package-private: later lifecycle units reuse it. Overdue is derived here, never stored
    // (Decision 7): PENDING and due strictly before today (UTC via the injected Clock).
    BookingResponse toResponse(PlotBooking booking, List<EmiInstallment> installments) {
        return toResponses(List.of(booking), Map.of(booking.getId(), installments)).get(0);
    }

    // Unit 14b: plotNo / projectName / associateName are batch-loaded (3 findAllById calls for the
    // whole list, no N+1). A missing referent gives null, never an exception.
    List<BookingResponse> toResponses(List<PlotBooking> bookings, Map<UUID, List<EmiInstallment>> installmentsByBooking) {
        if (bookings.isEmpty()) { return List.of(); }
        Map<UUID, Plot> plots = byId(plotRepository.findAllById(ids(bookings, PlotBooking::getPlotId)), Plot::getId);
        Map<UUID, Project> projects = byId(projectRepository.findAllById(
            plots.values().stream().map(Plot::getProjectId).filter(java.util.Objects::nonNull).distinct().toList()), Project::getId);
        Map<UUID, Associate> associates = byId(associateRepository.findAllById(ids(bookings, PlotBooking::getAssociateId)), Associate::getId);
        LocalDate today = LocalDate.now(clock);
        return bookings.stream().map(booking -> {
            List<EmiInstallment> installments = installmentsByBooking.getOrDefault(booking.getId(), List.of());
            List<EmiInstallmentResponse> rows = installments.stream()
                .map(i -> new EmiInstallmentResponse(
                    i.getInstallmentNumber(), i.getAmount(), i.getDueDate(), i.getStatus(), i.getPaidAt(),
                    i.getStatus() == InstallmentStatus.PENDING && i.getDueDate().isBefore(today)))
                .toList();
            Plot plot = plots.get(booking.getPlotId());
            Project project = plot == null ? null : projects.get(plot.getProjectId());
            Associate associate = associates.get(booking.getAssociateId());
            return new BookingResponse(
                booking.getId(), booking.getPlotId(), booking.getAssociateId(),
                booking.getStatus(), booking.getBuyerName(),
                booking.getTotalAmount(), booking.getInstallmentCount(), booking.getBookedAt(),
                sumByStatus(installments, InstallmentStatus.PAID),
                sumByStatus(installments, InstallmentStatus.PENDING),
                rows,
                plot == null ? null : plot.getPlotNo(),
                project == null ? null : project.getName(),
                associate == null ? null : associate.getName());
        }).toList();
    }

    private static List<UUID> ids(Collection<PlotBooking> bookings, java.util.function.Function<PlotBooking, UUID> f) {
        return bookings.stream().map(f).filter(java.util.Objects::nonNull).distinct().toList();
    }

    private static <T> Map<UUID, T> byId(Iterable<T> items, java.util.function.Function<T, UUID> id) {
        Map<UUID, T> m = new HashMap<>();
        items.forEach(i -> m.put(id.apply(i), i));
        return m;
    }

    private BigDecimal sumByStatus(List<EmiInstallment> installments, InstallmentStatus status) {
        return installments.stream().filter(i -> i.getStatus() == status)
            .map(EmiInstallment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
