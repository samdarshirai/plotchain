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

        BigDecimal listPrice = plot.getPrice();
        BigDecimal discount = request.discount() == null ? BigDecimal.ZERO
            : request.discount().setScale(2, RoundingMode.HALF_UP);
        if (discount.signum() < 0 || discount.compareTo(listPrice) >= 0) {
            throw new InvalidDiscountException(discount, listPrice);
        }
        // Booking's extraPrice overrides the plot's default; null = use the plot's.
        BigDecimal extraPrice = (request.extraPrice() != null ? request.extraPrice() : plot.getExtraPrice())
            .setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = listPrice.add(extraPrice).subtract(discount);
        BigDecimal token = request.tokenAmount();
        if (token.compareTo(total) >= 0) {
            throw new InvalidTokenAmountException(token, total);
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
        BigDecimal firstInstallment = request.firstInstallmentAmount();
        if (firstInstallment != null && firstInstallment.compareTo(total.subtract(token)) > 0) {
            throw new InvalidFirstInstallmentException(firstInstallment, total.subtract(token));
        }
        List<EmiInstallment> schedule = computeSchedule(total, token, config, bookedAt, associate.getId(), request, firstInstallment);

        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(plot.getId());
        booking.setAssociateId(associate.getId());
        booking.setTotalAmount(total);
        booking.setListPrice(listPrice);
        booking.setDiscount(discount);
        booking.setExtraPrice(extraPrice);
        booking.setAreaSqft(plot.getAreaSqft());
        booking.setRate(plot.getRate());
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

    // U2: only ENTERS the payment (PENDING -> ENTERED); confirmPayment moves it to PAID and is the
    // only thing that feeds Paid/Due and the AUTO_THRESHOLD check.
    // Row-locks the booking FIRST (Decision 8) so two simultaneous pays on one installment
    // serialize: the loser re-reads the installment as ENTERED and gets 409. Check order is the
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
        installment.setStatus(InstallmentStatus.ENTERED);
        installment.setPaymentMode(request.paymentMode());
        installment.setPaidAt(request.paidAt() != null ? request.paidAt() : now);
        installment.setPaymentRef(paymentRef);
        installment.setRecordedBy(actorId);
        installment.setRecordedAt(now);
        emiInstallmentRepository.save(installment);

        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.PAID, actorId,
            "entered: installment " + installmentNumber + ", amount " + installment.getAmount().toPlainString()
                + ", ref " + paymentRef + ", mode " + request.paymentMode(), now));

        return toResponse(booking, installments);
    }

    // Add Plot EMI top-up: one ENTERED row (the payment record, appended as the next number) is added and the
    // oldest PENDING rows are consumed by the same amount (fully covered -> VOID, partly covered -> reduced), so the
    // scheduled total is unchanged. Booking lock first (Decision 8); every 4xx happens before the first write.
    // Confirmation stays the separate ENTERED -> PAID step.
    @Transactional
    public BookingResponse topUp(UUID bookingId, TopUpRequest request, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        String bankName = request.bankName() == null ? "" : request.bankName().trim();
        if (request.paymentMode() != PaymentMode.CASH && bankName.isEmpty()) {
            throw new InvalidTopUpException("Bank name is required for " + request.paymentMode());
        }
        List<EmiInstallment> installments = new ArrayList<>(
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
        BigDecimal pending = sumByStatus(installments, InstallmentStatus.PENDING);
        BigDecimal amount = request.amount().setScale(2, RoundingMode.HALF_UP);
        if (amount.signum() <= 0 || amount.compareTo(pending) > 0) {
            throw new InvalidTopUpException("Top up amount must be between 0.01 and the remaining pending amount "
                + pending.toPlainString());
        }

        Instant now = clock.instant();
        BigDecimal left = amount;
        for (EmiInstallment i : installments) {
            if (i.getStatus() != InstallmentStatus.PENDING || left.signum() == 0) { continue; }
            if (left.compareTo(i.getAmount()) >= 0) {
                left = left.subtract(i.getAmount());
                i.setStatus(InstallmentStatus.VOID);
            } else {
                i.setAmount(i.getAmount().subtract(left));
                left = BigDecimal.ZERO;
            }
        }
        String paymentRef = request.paymentRef().trim();
        EmiInstallment payment = new EmiInstallment();
        payment.setId(UUID.randomUUID());
        payment.setBookingId(bookingId);
        payment.setInstallmentNumber(installments.stream().mapToInt(EmiInstallment::getInstallmentNumber).max().orElse(0) + 1);
        Instant paidAt = request.paidAt() != null ? request.paidAt() : now;
        payment.setDueDate(paidAt.atZone(java.time.ZoneOffset.UTC).toLocalDate());
        payment.setAmount(amount);
        payment.setStatus(InstallmentStatus.ENTERED);
        payment.setPaymentMode(request.paymentMode());
        payment.setBankName(bankName.isEmpty() ? null : bankName);
        payment.setPaymentRef(paymentRef);
        payment.setPaidAt(paidAt);
        payment.setRecordedBy(actorId);
        payment.setRecordedAt(now);
        installments.add(payment);
        emiInstallmentRepository.saveAll(installments);

        booking.setInstallmentCount((int) installments.stream()
            .filter(i -> i.getStatus() != InstallmentStatus.VOID).count());
        plotBookingRepository.save(booking);

        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.PAID, actorId,
            "entered: top-up #" + payment.getInstallmentNumber() + ", amount " + amount.toPlainString()
                + ", ref " + paymentRef + ", mode " + request.paymentMode(), now));

        return toResponse(booking, installments);
    }

    // U2: admin confirms an ENTERED payment (ENTERED -> PAID). Allowed on ACTIVE or CONFIRMED bookings,
    // never CANCELLED. Booking lock first (Decision 8); the plot lock is taken only inside confirmLocked.
    @Transactional
    public BookingResponse confirmPayment(UUID bookingId, int installmentNumber, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        return confirmEntered(booking, List.of(installmentNumber), actorId);
    }

    // U2 bulk: all-or-nothing in one transaction. Locks ALL distinct bookings first in ascending id order
    // (deadlock-safe against other bulks), then confirms. The offending item on failure is the first in
    // (bookingId, installmentNumber) order. Duplicates in the request are rejected up front.
    @Transactional
    public List<BookingResponse> confirmPayments(List<PaymentRef> items, UUID actorId) {
        java.util.SortedMap<UUID, List<Integer>> byBooking = new java.util.TreeMap<>();
        java.util.Set<PaymentRef> seen = new java.util.HashSet<>();
        for (PaymentRef r : items) {
            if (!seen.add(r)) {
                throw new DuplicatePaymentRefException(r.bookingId(), r.installmentNumber());
            }
            byBooking.computeIfAbsent(r.bookingId(), k -> new ArrayList<>()).add(r.installmentNumber());
        }
        Map<UUID, PlotBooking> locked = new java.util.LinkedHashMap<>();
        for (UUID id : byBooking.keySet()) {
            locked.put(id, plotBookingRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new BookingNotFoundException(id)));
        }
        List<BookingResponse> out = new ArrayList<>();
        byBooking.forEach((id, numbers) -> {
            java.util.Collections.sort(numbers);
            out.add(confirmEntered(locked.get(id), numbers, actorId));
        });
        return out;
    }

    // Shared by single + bulk. PRECONDITION: booking row already locked by the caller. All listed
    // installments are marked PAID first and the threshold check runs ONCE per booking at the end, and
    // only while ACTIVE (a CONFIRMED booking never re-confirms or gets a second Sale).
    private BookingResponse confirmEntered(PlotBooking booking, List<Integer> numbers, UUID actorId) {
        if (booking.getStatus() != BookingStatus.ACTIVE && booking.getStatus() != BookingStatus.CONFIRMED) {
            throw new BookingNotActiveException(booking.getId());
        }
        List<EmiInstallment> installments =
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId());
        Instant now = clock.instant();
        for (int n : numbers) {
            EmiInstallment installment = installments.stream()
                .filter(i -> i.getInstallmentNumber() == n)
                .findFirst()
                .orElseThrow(() -> new InstallmentNotFoundException(booking.getId(), n));
            if (installment.getStatus() != InstallmentStatus.ENTERED) {
                throw new InstallmentNotEnteredException(booking.getId(), n);
            }
            installment.setStatus(InstallmentStatus.PAID);
            installment.setConfirmedAt(now);
            installment.setConfirmedBy(actorId);
            emiInstallmentRepository.save(installment);
            bookingEventRepository.save(BookingEvent.of(booking.getId(), BookingEventType.PAY_CONFIRMED, actorId,
                "installment " + n + ", amount " + installment.getAmount().toPlainString()
                    + ", ref " + installment.getPaymentRef(), now));
        }
        if (booking.getStatus() == BookingStatus.ACTIVE) {
            afterInstallmentPaid(booking, installments, actorId);
        }
        return toResponse(booking, installments);
    }

    // Unit 5: AUTO_THRESHOLD auto-confirm (spec Decision 1, Flow "Record payment"). U2: now runs from
    // confirmEntered (only for ACTIVE bookings), inside the locked transaction, after the PAY_CONFIRMED event and before the response is built, so
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
    // PAID installments are untouched; PENDING and ENTERED (unconfirmed) -> VOID; amounts retained as a note only (no refunds).
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
        int voidedEntered = 0;
        for (EmiInstallment installment : installments) {
            if (installment.getStatus() == InstallmentStatus.ENTERED) {
                voidedEntered++;
            }
            if (installment.getStatus() == InstallmentStatus.PENDING || installment.getStatus() == InstallmentStatus.ENTERED) {
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
            "reason: " + reason + "; paid: " + paid.toPlainString()
                + "; unconfirmed payments voided: " + voidedEntered + plotNote, now));

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

    // Reference "Add Plot EMI" (reference-gap U4): re-split the unpaid balance of an ACTIVE booking over
    // `count` new monthly PENDING instalments. PAID and ENTERED rows (and the token) stay; old PENDING rows
    // become VOID. Booking lock first (Decision 8); the plot is not touched, so no plot lock. Every 4xx
    // happens before the first write. Not idempotent by design: a repeat call re-splits again (audited).
    @Transactional
    public BookingResponse rescheduleBooking(UUID bookingId, RescheduleRequest request, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        List<EmiInstallment> installments = new ArrayList<>(
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));

        BigDecimal committed = sumByStatus(installments, InstallmentStatus.PAID)
            .add(sumByStatus(installments, InstallmentStatus.ENTERED));
        BigDecimal balance = booking.getTotalAmount().subtract(committed).setScale(2, RoundingMode.HALF_UP);
        if (balance.signum() <= 0) {
            throw new NothingToRescheduleException(bookingId);
        }
        int count = request.installmentCount();
        LocalDate firstDue = request.firstDueDate();
        if (firstDue.isBefore(LocalDate.now(clock))) {
            throw new InvalidRescheduleException("First due date must be today or later");
        }
        BigDecimal base = balance.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);
        if (base.signum() <= 0) {
            throw new InvalidRescheduleException("Remaining balance " + balance.toPlainString()
                + " is too small to split into " + count + " instalments");
        }

        int nextNumber = installments.stream().mapToInt(EmiInstallment::getInstallmentNumber).max().orElse(0) + 1;
        int firstVoided = 0, lastVoided = 0, voided = 0;
        for (EmiInstallment i : installments) {
            if (i.getStatus() == InstallmentStatus.PENDING) {
                i.setStatus(InstallmentStatus.VOID);
                if (voided++ == 0) { firstVoided = i.getInstallmentNumber(); }
                lastVoided = i.getInstallmentNumber();
            }
        }
        BigDecimal running = BigDecimal.ZERO;
        for (int k = 0; k < count; k++) {
            EmiInstallment n = new EmiInstallment();
            n.setId(UUID.randomUUID());
            n.setBookingId(bookingId);
            n.setInstallmentNumber(nextNumber + k);
            n.setDueDate(firstDue.plusMonths(k)); // from the first date, never cumulative: no month-end drift
            n.setAmount(k == count - 1 ? balance.subtract(running) : base); // last absorbs the DOWN remainder
            running = running.add(base);
            installments.add(n);
        }
        emiInstallmentRepository.saveAll(installments);

        booking.setInstallmentCount((int) installments.stream()
            .filter(i -> i.getStatus() != InstallmentStatus.VOID).count());
        plotBookingRepository.save(booking);

        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.RESCHEDULED, actorId,
            "voided " + voided + " pending" + (voided > 0 ? " (#" + firstVoided + "-#" + lastVoided + ")" : "")
                + "; balance " + balance.toPlainString() + " over " + count + " from " + firstDue, clock.instant()));

        return toResponse(booking, installments);
    }

    // Admin moves an ACTIVE booking to another AVAILABLE plot of the same project. Prices come from the
    // new plot (booking discount is kept); PAID/ENTERED money stays, PENDING rows become VOID and the new
    // balance is re-split over as many instalments, on the same due dates. Lock order: booking, then both
    // plots by ascending id so two crossing transfers cannot deadlock. Every 4xx precedes the first write.
    @Transactional
    public BookingResponse transferPlot(UUID bookingId, UUID newPlotId, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        UUID oldPlotId = booking.getPlotId();
        if (oldPlotId.equals(newPlotId)) {
            throw new InvalidPlotTransferException("Booking is already on plot " + newPlotId);
        }
        boolean oldFirst = oldPlotId.compareTo(newPlotId) < 0;
        UUID firstId = oldFirst ? oldPlotId : newPlotId;
        UUID secondId = oldFirst ? newPlotId : oldPlotId;
        Plot first = plotRepository.findByIdForUpdate(firstId)
            .orElseThrow(() -> new PlotNotFoundException(firstId));
        Plot second = plotRepository.findByIdForUpdate(secondId)
            .orElseThrow(() -> new PlotNotFoundException(secondId));
        Plot oldPlot = oldFirst ? first : second;
        Plot newPlot = oldFirst ? second : first;

        if (!java.util.Objects.equals(oldPlot.getProjectId(), newPlot.getProjectId())) {
            throw new InvalidPlotTransferException("Target plot must be in the same project");
        }
        if (newPlot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(newPlotId);
        }

        BigDecimal listPrice = newPlot.getPrice();
        BigDecimal discount = booking.getDiscount() == null ? BigDecimal.ZERO : booking.getDiscount();
        if (discount.compareTo(listPrice) >= 0) {
            throw new InvalidDiscountException(discount, listPrice);
        }
        BigDecimal extraPrice = newPlot.getExtraPrice().setScale(2, RoundingMode.HALF_UP);
        BigDecimal newTotal = listPrice.add(extraPrice).subtract(discount);

        List<EmiInstallment> installments = new ArrayList<>(
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
        BigDecimal committed = sumByStatus(installments, InstallmentStatus.PAID)
            .add(sumByStatus(installments, InstallmentStatus.ENTERED));
        BigDecimal balance = newTotal.subtract(committed).setScale(2, RoundingMode.HALF_UP);
        if (balance.signum() <= 0) {
            throw new InvalidPlotTransferException("New plot total " + newTotal.toPlainString()
                + " does not exceed the amount already paid " + committed.toPlainString());
        }

        List<LocalDate> dueDates = new ArrayList<>();
        for (EmiInstallment i : installments) {
            if (i.getStatus() == InstallmentStatus.PENDING) {
                i.setStatus(InstallmentStatus.VOID);
                dueDates.add(i.getDueDate());
            }
        }
        if (dueDates.isEmpty()) { dueDates.add(LocalDate.now(clock)); }
        int count = dueDates.size();
        BigDecimal base = balance.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);
        int nextNumber = installments.stream().mapToInt(EmiInstallment::getInstallmentNumber).max().orElse(0) + 1;
        BigDecimal running = BigDecimal.ZERO;
        for (int k = 0; k < count; k++) {
            EmiInstallment n = new EmiInstallment();
            n.setId(UUID.randomUUID());
            n.setBookingId(bookingId);
            n.setInstallmentNumber(nextNumber + k);
            n.setDueDate(dueDates.get(k));
            n.setAmount(k == count - 1 ? balance.subtract(running) : base); // last absorbs the DOWN remainder
            running = running.add(base);
            installments.add(n);
        }
        emiInstallmentRepository.saveAll(installments);

        BigDecimal oldTotal = booking.getTotalAmount();
        booking.setPlotId(newPlotId);
        booking.setListPrice(listPrice);
        booking.setExtraPrice(extraPrice);
        booking.setAreaSqft(newPlot.getAreaSqft());
        booking.setRate(newPlot.getRate());
        booking.setTotalAmount(newTotal);
        booking.setInstallmentCount((int) installments.stream()
            .filter(i -> i.getStatus() != InstallmentStatus.VOID).count());
        plotBookingRepository.save(booking);

        newPlot.setStatus(PlotStatus.BOOKED);
        plotRepository.save(newPlot);
        // Same stale-booking guard as cancel: never free a plot another live booking holds.
        String plotNote = "";
        if (oldPlot.getStatus() == PlotStatus.BOOKED) {
            Optional<PlotBooking> holder = plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
                oldPlotId, bookingId, List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED));
            if (holder.isPresent()) {
                plotNote = "; old plot kept: held by booking " + holder.get().getId();
            } else {
                oldPlot.setStatus(PlotStatus.AVAILABLE);
                plotRepository.save(oldPlot);
            }
        }

        bookingEventRepository.save(BookingEvent.plotTransfer(bookingId, actorId,
            "from " + oldPlot.getPlotNo() + " to " + newPlot.getPlotNo() + "; total " + oldTotal.toPlainString()
                + " -> " + newTotal.toPlainString() + plotNote, clock.instant(),
            oldPlotId, newPlotId, committed, balance));

        return toResponse(booking, installments);
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

    // position: null = whole team, "L"/"R" = that leg. Scoped to the caller's downline by the query.
    public AssociateBookingPageResponse getTeamBookings(UUID associateId, String position, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.findByDownline(associateId, position, PageRequest.of(page, size));
        List<BookingResponse> bookings = toResponses(result.getContent(), emiInstallmentRepository
            .findByBookingIdInOrderByInstallmentNumberAsc(
                result.getContent().stream().map(PlotBooking::getId).toList()).stream()
            .collect(java.util.stream.Collectors.groupingBy(EmiInstallment::getBookingId)))
            .stream().map(BookingResponse::withoutBuyerPhone).toList();
        return new AssociateBookingPageResponse(bookings, page, size, result.getTotalElements());
    }

    // Dates are inclusive calendar days (UTC, as elsewhere); null bound = unbounded.
    static Instant fromInstant(LocalDate d) { return d == null ? Instant.EPOCH : d.atStartOfDay().toInstant(ZoneOffset.UTC); }
    static Instant toInstant(LocalDate d) { return d == null ? Instant.parse("9999-01-01T00:00:00Z") : d.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC); }

    public BusinessReportResponse getMyBusiness(UUID associateId, LocalDate from, LocalDate to) {
        return new BusinessReportResponse(
            businessLeg(associateId, "L", from, to), businessLeg(associateId, "R", from, to));
    }

    private List<BusinessReportRow> businessLeg(UUID associateId, String position, LocalDate from, LocalDate to) {
        List<PlotBooking> bookings = plotBookingRepository.findByDownlineBetween(
            associateId, position, fromInstant(from), toInstant(to));
        Map<UUID, Associate> associates = new HashMap<>();
        associateRepository.findAllById(bookings.stream().map(PlotBooking::getAssociateId).distinct().toList())
            .forEach(a -> associates.put(a.getId(), a));
        Map<UUID, Plot> plots = new HashMap<>();
        plotRepository.findAllById(bookings.stream().map(PlotBooking::getPlotId).distinct().toList())
            .forEach(p -> plots.put(p.getId(), p));
        Map<UUID, Project> projects = new HashMap<>();
        projectRepository.findAllById(plots.values().stream().map(Plot::getProjectId).distinct().toList())
            .forEach(p -> projects.put(p.getId(), p));
        return bookings.stream().map(b -> {
            Associate a = associates.get(b.getAssociateId());
            Plot p = plots.get(b.getPlotId());
            Project pr = projects.get(p.getProjectId());
            return new BusinessReportRow(b.getBookedAt(), b.getConfirmedAt(), a.getUserId(), a.getName(),
                pr.getName(), p.getPlotNo(), b.getTotalAmount());
        }).toList();
    }

    public List<EmiReportRow> getEmiReport(UUID associateId, LocalDate from, LocalDate to) {
        return emiInstallmentRepository.findEmiReport(associateId, fromInstant(from), toInstant(to));
    }

    // Flat, no-interest amortization: BookingEmiConfig carries no down-payment-percentage or
    // interest-rate field (only emiEnabled, defaultInstallmentCount, confirmRule,
    // confirmThresholdPercent -- confirmed by reading the entity directly, not assumed), so
    // there is nothing to compound or front-load. When EMI is disabled, the schedule is a single
    // installment for the full amount, still due one month out -- the same formula as every
    // other case below, deliberately not special-cased to a due-today date, so there's one
    // schedule shape for a future payment-recording unit to reason about, not two.
    // Installment 1 is the token, ENTERED (unconfirmed) at booking time; admin confirms it like any payment. The rest of the price (total - token) splits
    // equally across the other installments: the configured count less the token's slot, and at
    // least one (so with EMI off the schedule is token + one balance installment).
    private List<EmiInstallment> computeSchedule(BigDecimal totalAmount, BigDecimal token,
                                                 BookingEmiConfig config, Instant bookedAt,
                                                 UUID tokenConfirmedBy, CreateBookingRequest request,
                                                 BigDecimal firstInstallment) {
        int count = config.isEmiEnabled() ? config.getDefaultInstallmentCount() : 1;
        int balanceCount = Math.max(count - 1, 1);
        LocalDate bookedDate = bookedAt.atZone(ZoneOffset.UTC).toLocalDate();
        BigDecimal balance = totalAmount.subtract(token);
        // Optional explicit first EMI (installment 2); the rest of the balance splits over the others.
        BigDecimal first = firstInstallment == null ? null : firstInstallment.setScale(2, RoundingMode.HALF_UP);
        if (first != null && balanceCount == 1 && first.compareTo(balance) != 0) {
            throw new InvalidFirstInstallmentException(first, balance);
        }
        BigDecimal rest = first == null ? balance : balance.subtract(first);
        int restCount = first == null ? balanceCount : balanceCount - 1;
        BigDecimal base = restCount == 0 ? BigDecimal.ZERO : rest.divide(BigDecimal.valueOf(restCount), 2, RoundingMode.DOWN);

        List<EmiInstallment> schedule = new ArrayList<>();
        EmiInstallment tokenInstallment = new EmiInstallment();
        tokenInstallment.setId(UUID.randomUUID());
        tokenInstallment.setInstallmentNumber(1);
        tokenInstallment.setAmount(token);
        tokenInstallment.setDueDate(bookedDate);
        tokenInstallment.setStatus(InstallmentStatus.ENTERED);
        tokenInstallment.setPaidAt(request.txnDate() == null ? bookedAt : request.txnDate().atStartOfDay(ZoneOffset.UTC).toInstant());
        tokenInstallment.setPaymentRef(request.txnNo() == null || request.txnNo().isBlank() ? "TOKEN" : request.txnNo().trim());
        tokenInstallment.setPaymentMode(request.paymentMode());
        tokenInstallment.setBankName(request.bankName() == null || request.bankName().isBlank() ? null : request.bankName().trim());
        tokenInstallment.setRecordedAt(bookedAt);
        tokenInstallment.setRecordedBy(tokenConfirmedBy);
        schedule.add(tokenInstallment);

        // Amounts for installments 2..balanceCount+1; the last absorbs rounding so the total is exact.
        BigDecimal running = BigDecimal.ZERO;
        for (int i = 1; i <= balanceCount; i++) {
            BigDecimal amount;
            if (i == 1 && first != null) { amount = first; }
            else if (i == balanceCount) { amount = balance.subtract(running); }
            else { amount = base; }
            running = running.add(amount);
            EmiInstallment installment = new EmiInstallment();
            installment.setId(UUID.randomUUID());
            installment.setInstallmentNumber(i + 1);
            installment.setAmount(amount);
            installment.setDueDate(bookedDate.plusMonths(i));
            schedule.add(installment);
        }

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
                    i.getStatus() == InstallmentStatus.PENDING && i.getDueDate().isBefore(today),
                    i.getPaymentMode(), i.getConfirmedAt(), i.getBankName(), i.getPaymentRef(), i.getRecordedAt()))
                .toList();
            Plot plot = plots.get(booking.getPlotId());
            Project project = plot == null ? null : projects.get(plot.getProjectId());
            Associate associate = associates.get(booking.getAssociateId());
            return new BookingResponse(
                booking.getId(), booking.getPlotId(), booking.getAssociateId(),
                booking.getStatus(), booking.getBuyerName(),
                booking.getTotalAmount(), booking.getInstallmentCount(), booking.getBookedAt(),
                sumByStatus(installments, InstallmentStatus.PAID),
                // ENTERED is received-but-unconfirmed money: still due until confirmed (paid + due = total).
                sumByStatus(installments, InstallmentStatus.PENDING).add(sumByStatus(installments, InstallmentStatus.ENTERED)),
                rows,
                plot == null ? null : plot.getPlotNo(),
                project == null ? null : project.getName(),
                associate == null ? null : associate.getName(),
                booking.getBuyerPhone(), booking.getListPrice(), booking.getDiscount(), booking.getAreaSqft(),
                booking.getRate(), booking.getCancelledAt(), associate == null ? null : associate.getUserId(),
                plot == null ? null : plot.getPlotType(),
                booking.getExtraPrice(),
                associate == null ? null : associate.getPhone(),
                booking.getCancelReason());
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
