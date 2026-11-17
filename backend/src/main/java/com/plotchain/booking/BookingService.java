package com.plotchain.booking;

import com.plotchain.common.Money;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.expense.ExpenseRequest;
import com.plotchain.expense.ExpenseService;
import com.plotchain.expensetype.ExpenseTypeRepository;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
    private final ExpenseService expenseService;
    private final ExpenseTypeRepository expenseTypeRepository;
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
            ExpenseService expenseService,
            ExpenseTypeRepository expenseTypeRepository,
            Clock clock) {
        this.saleService = saleService;
        this.expenseService = expenseService;
        this.expenseTypeRepository = expenseTypeRepository;
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
            : request.discount().setScale(0, RoundingMode.HALF_UP);
        if (discount.signum() < 0 || discount.compareTo(listPrice) >= 0) {
            throw new InvalidDiscountException(discount, listPrice);
        }
        // Booking's extraPercent (of list price) wins, then its flat extraPrice; null = the plot's default.
        BigDecimal extraPrice = (request.extraPercent() != null
            ? Money.percentOf(listPrice, request.extraPercent())
            : request.extraPrice() != null ? request.extraPrice() : plot.getExtraPrice())
            .setScale(0, RoundingMode.HALF_UP);
        BigDecimal total = listPrice.add(extraPrice).subtract(discount);
        BigDecimal token = Money.round(request.tokenAmount());
        if (token.compareTo(total) > 0) {
            throw new InvalidTokenAmountException(token, total);
        }

        if (request.buyerAssociateId() == null) {
            throw new InvalidBuyerException("Buyer associate is required");
        }
        Associate buyer = associateRepository.findById(request.buyerAssociateId())
            .orElseThrow(() -> new InvalidBuyerException("Buyer associate not found"));
        if (buyer.getStatus() != com.plotchain.associate.AssociateStatus.ACTIVE
                || !associateRepository.hasActivationEpin(buyer.getId())) {
            throw new InvalidBuyerException("Buyer must be an active associate with an e-PIN");
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
        booking.setBuyerAssociateId(buyer.getId());
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
        BigDecimal amount = request.amount().setScale(0, RoundingMode.HALF_UP);
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
        payment.setReceiptNo(request.receiptNo().trim());
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
    // never CANCELLED. Booking lock first (Decision 8); the plot lock is taken only for the completing payment.
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
            creditConfirmedPayments(booking, installments, numbers, actorId);
        }
        return toResponse(booking, installments);
    }

    // Admin payment confirmation is the only trigger for business and income: each newly PAID
    // installment gets its own Sale (amount = installment amount) inside the locked transaction, so
    // dashboards, reports and the ledger update immediately. Once every live installment is PAID the
    // booking is CONFIRMED (fully paid) and the plot goes BOOKED -> SOLD on that last Sale. Legacy
    // bookings already CONFIRMED under the old one-Sale-per-booking rule never reach here (ACTIVE only).
    // Holds the booking lock; the plot lock is taken only for the completing payment
    // (booking -> plot, Decision 8). Any failure rolls the whole confirmation back.
    private void creditConfirmedPayments(PlotBooking booking, List<EmiInstallment> installments,
                                         List<Integer> numbers, UUID actorId) {
        boolean fullyPaid = installments.stream()
            .filter(i -> i.getStatus() != InstallmentStatus.VOID)
            .allMatch(i -> i.getStatus() == InstallmentStatus.PAID);
        Plot plot = fullyPaid
            ? plotRepository.findByIdForUpdate(booking.getPlotId()).orElseThrow(() -> missingPlot(booking))
            : plotRepository.findById(booking.getPlotId()).orElseThrow(() -> missingPlot(booking));
        if (fullyPaid && plot.getStatus() != PlotStatus.BOOKED) {
            // Checked here so the failure is the booking-flavoured PlotNotAvailableException (409).
            throw new PlotNotAvailableException(plot.getId());
        }
        Instant now = clock.instant();
        for (int n : numbers) {
            EmiInstallment installment = installments.stream()
                .filter(i -> i.getInstallmentNumber() == n).findFirst().orElseThrow();
            boolean completes = fullyPaid && n == numbers.get(numbers.size() - 1);
            saleService.recordInstallmentPayment(
                booking.getId(), installment.getId(), n, booking.getAssociateId(), booking.getBuyerAssociateId(),
                booking.getBuyerPhone(), installment.getAmount(), plot, completes);
        }
        if (fullyPaid) {
            booking.setStatus(BookingStatus.CONFIRMED);
            booking.setConfirmedAt(now);
            plotBookingRepository.save(booking);
            bookingEventRepository.save(BookingEvent.of(booking.getId(), BookingEventType.CONFIRMED,
                actorId, "fully paid, amount " + booking.getTotalAmount().toPlainString(), now));
        }
    }

    // One-off backfill for BookingSaleBackfill: credits a Sale per PAID installment confirmed before
    // business was credited per payment. ACTIVE bookings go through the normal path (so a fully paid
    // one is completed: CONFIRMED, plot SOLD); CANCELLED bookings keep their retained payments as
    // business but never touch the plot. Sales land in the current open cycle.
    @Transactional
    public void backfillPaymentSales(UUID bookingId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        List<EmiInstallment> missing = emiInstallmentRepository.findUncreditedPaid(bookingId);
        if (missing.isEmpty() || booking.getStatus() == BookingStatus.CONFIRMED) {
            return;
        }
        List<Integer> numbers = missing.stream().map(EmiInstallment::getInstallmentNumber).toList();
        UUID actorId = missing.get(missing.size() - 1).getConfirmedBy() != null
            ? missing.get(missing.size() - 1).getConfirmedBy() : booking.getAssociateId();
        if (booking.getStatus() == BookingStatus.ACTIVE) {
            creditConfirmedPayments(booking, emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId),
                numbers, actorId);
            return;
        }
        Plot plot = plotRepository.findById(booking.getPlotId()).orElseThrow(() -> missingPlot(booking));
        for (EmiInstallment i : missing) {
            saleService.recordInstallmentPayment(booking.getId(), i.getId(), i.getInstallmentNumber(),
                booking.getAssociateId(), booking.getBuyerAssociateId(), booking.getBuyerPhone(), i.getAmount(), plot, false);
        }
    }

    private IllegalStateException missingPlot(PlotBooking booking) {
        return new IllegalStateException(
            "plot row missing for booking " + booking.getId() + " - plot_id has an FK constraint");
    }

    // Plot-booking unit 6 (spec Flow "Cancel", Decisions 4, 8). Locks the booking FIRST so a concurrent
    // pay / confirm / cancel serializes on it (the loser re-reads CANCELLED/CONFIRMED and gets 409),
    // then the plot. LOCK ORDER IS BOOKING -> PLOT EVERYWHERE (Decision 8), same as creditConfirmedPayments.
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
        BigDecimal paidExact = sumByStatus(installments, InstallmentStatus.PAID);
        BigDecimal chargePct = request.chargePct();
        BigDecimal charge = null;
        BigDecimal refund = null;
        if (chargePct != null) {
            charge = paidExact.multiply(chargePct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            refund = paidExact.subtract(charge);
            if (refund.signum() > 0 && request.payMode() == null) {
                throw new InvalidCancellationException("Pay mode is required to record the refund");
            }
        }
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
        boolean plotFreed = false;
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
                plotFreed = true;
            }
        } else {
            plotNote = "; plot left " + plot.getStatus();
        }

        Instant now = clock.instant();
        String reason = request.reason().trim();
        booking.setStatus(BookingStatus.CANCELLED);
        booking.setCancelledAt(now);
        booking.setCancelReason(reason);

        String chargeNote = "";
        if (chargePct != null) {
            booking.setCancellationCharge(chargePct, charge, refund);
            String oldPlotNo = plot.getPlotNo();
            // Only a freed plot is renamed: if another live booking still holds it, renaming would mislabel that booking.
            if (plotFreed) {
                plot.setPlotNo(nextCancelledPlotNo(plot.getProjectId(), oldPlotNo));
                plotRepository.save(plot);
            }
            chargeNote = "; charge " + chargePct.stripTrailingZeros().toPlainString() + "%: " + charge.toPlainString()
                + "; refund: " + refund.toPlainString()
                + (plotFreed ? "; plot renamed " + oldPlotNo + " -> " + plot.getPlotNo() : "");
            if (refund.signum() > 0) {
                postRefundExpense(booking, plot, refund, request.payMode(), reason, actorId);
            }
        }
        plotBookingRepository.save(booking);

        BigDecimal paid = paidExact.setScale(0, RoundingMode.HALF_UP);
        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.CANCELLED, actorId,
            "reason: " + reason + "; paid: " + paid.toPlainString()
                + "; unconfirmed payments voided: " + voidedEntered + plotNote + chargeNote, now));

        return toResponse(booking, installments);
    }

    static final String REFUND_EXPENSE_TYPE = "Plot Cancellation Refund";
    private static final java.util.regex.Pattern CANCEL_SUFFIX = java.util.regex.Pattern.compile("^(.*) New(\\d+)$");

    // "A-12" -> "A-12 New1" -> "A-12 New2": the counter goes up on every cancel of the same plot.
    static String bumpCancelSuffix(String plotNo) {
        java.util.regex.Matcher m = CANCEL_SUFFIX.matcher(plotNo);
        return m.matches() ? m.group(1) + " New" + (Integer.parseInt(m.group(2)) + 1) : plotNo + " New1";
    }

    // Keeps bumping until the name is free in the project (UNIQUE (project_id, plot_no)).
    private String nextCancelledPlotNo(UUID projectId, String plotNo) {
        String next = bumpCancelSuffix(plotNo);
        while (!plotRepository.findAllByProjectIdAndPlotNoIn(projectId, List.of(next)).isEmpty()) {
            next = bumpCancelSuffix(next);
        }
        return next;
    }

    private void postRefundExpense(PlotBooking booking, Plot plot, BigDecimal refund,
                                   com.plotchain.expense.PayMode payMode, String reason, UUID actorId) {
        postRefundExpense(REFUND_EXPENSE_TYPE, booking, plot, refund, payMode,
            "Plot " + plot.getPlotNo() + " cancelled; booking " + booking.getId() + "; " + reason, actorId);
    }

    private void postRefundExpense(String typeName, PlotBooking booking, Plot plot, BigDecimal refund,
                                   com.plotchain.expense.PayMode payMode, String note, UUID actorId) {
        UUID typeId = expenseTypeRepository.findByNameIgnoreCase(typeName)
            .orElseThrow(() -> new IllegalStateException("expense type missing: " + typeName)).getId();
        String payTo = associateRepository.findById(booking.getAssociateId()).map(Associate::getName).orElse("Associate");
        expenseService.create(new ExpenseRequest(LocalDate.now(clock), typeId, plot.getProjectId(), payTo, refund, payMode,
            null, null, note), actorId);
    }

    static final String TRANSFER_REFUND_EXPENSE_TYPE = "Plot Transfer Refund";

    private static BigDecimal pct(BigDecimal amount, BigDecimal chargePct) {
        return amount.multiply(chargePct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    // Takes `amount` out of the PAID rows, latest first (fully taken -> VOID, partly -> reduced). The Sale/income
    // already credited for those rows is NOT reversed (decision: no income reversal on transfer/move).
    private static void takePaid(List<EmiInstallment> installments, BigDecimal amount) {
        BigDecimal left = amount;
        for (int k = installments.size() - 1; k >= 0 && left.signum() > 0; k--) {
            EmiInstallment i = installments.get(k);
            if (i.getStatus() != InstallmentStatus.PAID) { continue; }
            if (left.compareTo(i.getAmount()) >= 0) {
                left = left.subtract(i.getAmount());
                i.setStatus(InstallmentStatus.VOID);
            } else {
                i.setAmount(i.getAmount().subtract(left));
                left = BigDecimal.ZERO;
            }
        }
    }

    private static boolean fullyPaid(List<EmiInstallment> installments) {
        List<EmiInstallment> live = installments.stream().filter(i -> i.getStatus() != InstallmentStatus.VOID).toList();
        return !live.isEmpty() && live.stream().allMatch(i -> i.getStatus() == InstallmentStatus.PAID);
    }

    // Admin moves an ACTIVE booking to another AVAILABLE plot of the same project. Prices come from the
    // new plot (booking discount is kept); PAID/ENTERED money stays, PENDING rows become VOID and the new
    // balance is re-split over as many instalments, on the same due dates. Lock order: booking, then both
    // plots by ascending id so two crossing transfers cannot deadlock. Every 4xx precedes the first write.
    public BookingResponse transferPlot(UUID bookingId, UUID newPlotId, UUID actorId) {
        return transferPlot(bookingId, new TransferPlotRequest(newPlotId), actorId);
    }

    // A target worth less than the PAID money is allowed: the excess is charged chargePct% and the rest refunded
    // as a "Plot Transfer Refund" expense; the booking is then fully paid on the new plot (CONFIRMED, plot SOLD).
    @Transactional
    public BookingResponse transferPlot(UUID bookingId, TransferPlotRequest request, UUID actorId) {
        UUID newPlotId = request.plotId();
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
        BigDecimal extraPrice = newPlot.getExtraPrice().setScale(0, RoundingMode.HALF_UP);
        BigDecimal newTotal = listPrice.add(extraPrice).subtract(discount);

        List<EmiInstallment> installments = new ArrayList<>(
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
        BigDecimal paid = sumByStatus(installments, InstallmentStatus.PAID);
        BigDecimal entered = sumByStatus(installments, InstallmentStatus.ENTERED);
        BigDecimal excess = paid.subtract(newTotal).max(BigDecimal.ZERO);
        BigDecimal charge = null;
        BigDecimal refund = null;
        if (excess.signum() > 0) {
            if (request.chargePct() == null) {
                throw new InvalidPlotTransferException("New plot total " + newTotal.toPlainString()
                    + " is below the amount already paid " + paid.toPlainString() + ": a cancellation charge % is required");
            }
            charge = pct(excess, request.chargePct());
            refund = excess.subtract(charge);
            if (refund.signum() > 0 && request.payMode() == null) {
                throw new InvalidPlotTransferException("Pay mode is required to record the refund");
            }
        } else if (paid.add(entered).compareTo(newTotal) > 0) {
            throw new InvalidPlotTransferException("New plot total " + newTotal.toPlainString()
                + " is below paid + unconfirmed payments " + paid.add(entered).toPlainString()
                + ": confirm or void the unconfirmed payments first");
        }
        BigDecimal committed = paid.subtract(excess).add(excess.signum() > 0 ? BigDecimal.ZERO : entered);
        BigDecimal balance = newTotal.subtract(committed).setScale(0, RoundingMode.HALF_UP);

        List<LocalDate> dueDates = new ArrayList<>();
        for (EmiInstallment i : installments) {
            if (i.getStatus() == InstallmentStatus.PENDING || (excess.signum() > 0 && i.getStatus() == InstallmentStatus.ENTERED)) {
                if (i.getStatus() == InstallmentStatus.PENDING) { dueDates.add(i.getDueDate()); }
                i.setStatus(InstallmentStatus.VOID);
            }
        }
        takePaid(installments, excess);
        if (dueDates.isEmpty()) { dueDates.add(LocalDate.now(clock)); }
        int count = balance.signum() > 0 ? dueDates.size() : 0;
        BigDecimal base = count == 0 ? BigDecimal.ZERO : balance.divide(BigDecimal.valueOf(count), 0, RoundingMode.DOWN);
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

        Instant now = clock.instant();
        boolean completed = fullyPaid(installments);
        newPlot.setStatus(completed ? PlotStatus.SOLD : PlotStatus.BOOKED);
        plotRepository.save(newPlot);
        if (completed) {
            booking.setStatus(BookingStatus.CONFIRMED);
            booking.setConfirmedAt(now);
            plotBookingRepository.save(booking);
        }
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

        String refundNote = "";
        if (refund != null) {
            refundNote = "; charge " + request.chargePct().stripTrailingZeros().toPlainString() + "%: " + charge.toPlainString()
                + "; refund: " + refund.toPlainString();
            if (refund.signum() > 0) {
                postRefundExpense(TRANSFER_REFUND_EXPENSE_TYPE, booking, newPlot, refund, request.payMode(),
                    "Plot " + oldPlot.getPlotNo() + " transferred to " + newPlot.getPlotNo() + "; booking " + bookingId,
                    actorId);
            }
        }
        bookingEventRepository.save(BookingEvent.plotTransfer(bookingId, actorId,
            "from " + oldPlot.getPlotNo() + " to " + newPlot.getPlotNo() + "; total " + oldTotal.toPlainString()
                + " -> " + newTotal.toPlainString() + refundNote + plotNote, now,
            oldPlotId, newPlotId, paid.add(entered), balance));
        if (completed) {
            bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.CONFIRMED, actorId,
                "fully paid, amount " + newTotal.toPlainString(), now));
        }

        return toResponse(booking, installments);
    }

    // Moves PAID money between two ACTIVE bookings of the same buyer. Target: a moved-in PAID row consumes its
    // oldest PENDING rows (like top-up); a fully paid target becomes CONFIRMED and its plot SOLD. No new income
    // (the source's payments were credited when confirmed). Source leftover: kept, or (refundRemainder) charged
    // chargePct% and refunded as "Plot Transfer Refund" with the source cancelled. Nothing left -> source cancelled
    // with no charge. Locks: both bookings by ascending id, then plots by ascending id.
    @Transactional
    public BookingResponse moveMoney(UUID sourceId, MoveMoneyRequest request, UUID actorId) {
        UUID targetId = request.targetBookingId();
        if (sourceId.equals(targetId)) {
            throw new InvalidPlotTransferException("Source and target booking must differ");
        }
        boolean sourceFirst = sourceId.compareTo(targetId) < 0;
        PlotBooking a = plotBookingRepository.findByIdForUpdate(sourceFirst ? sourceId : targetId)
            .orElseThrow(() -> new BookingNotFoundException(sourceFirst ? sourceId : targetId));
        PlotBooking b = plotBookingRepository.findByIdForUpdate(sourceFirst ? targetId : sourceId)
            .orElseThrow(() -> new BookingNotFoundException(sourceFirst ? targetId : sourceId));
        PlotBooking source = sourceFirst ? a : b;
        PlotBooking target = sourceFirst ? b : a;
        for (PlotBooking x : List.of(source, target)) {
            if (x.getStatus() != BookingStatus.ACTIVE) { throw new BookingNotActiveException(x.getId()); }
        }
        if (source.getBuyerAssociateId() == null || !source.getBuyerAssociateId().equals(target.getBuyerAssociateId())) {
            throw new InvalidPlotTransferException("Both bookings must belong to the same buyer");
        }
        Plot sourcePlot;
        Plot targetPlot;
        if (source.getPlotId().compareTo(target.getPlotId()) < 0) {
            sourcePlot = plotRepository.findByIdForUpdate(source.getPlotId()).orElseThrow(() -> missingPlot(source));
            targetPlot = plotRepository.findByIdForUpdate(target.getPlotId()).orElseThrow(() -> missingPlot(target));
        } else {
            targetPlot = plotRepository.findByIdForUpdate(target.getPlotId()).orElseThrow(() -> missingPlot(target));
            sourcePlot = plotRepository.findByIdForUpdate(source.getPlotId()).orElseThrow(() -> missingPlot(source));
        }

        List<EmiInstallment> src = new ArrayList<>(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(sourceId));
        List<EmiInstallment> tgt = new ArrayList<>(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(targetId));
        BigDecimal srcPaid = sumByStatus(src, InstallmentStatus.PAID);
        BigDecimal tgtPending = sumByStatus(tgt, InstallmentStatus.PENDING);
        BigDecimal amount = request.amount().setScale(0, RoundingMode.HALF_UP);
        if (amount.signum() <= 0 || amount.compareTo(srcPaid) > 0) {
            throw new InvalidPlotTransferException("Amount must be between 1 and the source's paid amount " + srcPaid.toPlainString());
        }
        if (amount.compareTo(tgtPending) > 0) {
            throw new InvalidPlotTransferException("Amount exceeds the target's remaining balance " + tgtPending.toPlainString());
        }
        BigDecimal leftover = srcPaid.subtract(amount);
        boolean refunding = leftover.signum() > 0 && request.refundRemainder();
        BigDecimal charge = null;
        BigDecimal refund = null;
        if (refunding) {
            if (request.chargePct() == null) {
                throw new InvalidPlotTransferException("Cancellation charge % is required to refund the remainder");
            }
            charge = pct(leftover, request.chargePct());
            refund = leftover.subtract(charge);
            if (refund.signum() > 0 && request.payMode() == null) {
                throw new InvalidPlotTransferException("Pay mode is required to record the refund");
            }
        }
        if (refunding && (request.reason() == null || request.reason().isBlank())) {
            throw new InvalidPlotTransferException("Reason is required when the source plot is cancelled");
        }

        Instant now = clock.instant();
        // target: consume PENDING oldest first, add the moved-in PAID row
        BigDecimal left = amount;
        for (EmiInstallment i : tgt) {
            if (i.getStatus() != InstallmentStatus.PENDING || left.signum() == 0) { continue; }
            if (left.compareTo(i.getAmount()) >= 0) {
                left = left.subtract(i.getAmount());
                i.setStatus(InstallmentStatus.VOID);
            } else {
                i.setAmount(i.getAmount().subtract(left));
                left = BigDecimal.ZERO;
            }
        }
        EmiInstallment moved = new EmiInstallment();
        moved.setId(UUID.randomUUID());
        moved.setBookingId(targetId);
        moved.setInstallmentNumber(tgt.stream().mapToInt(EmiInstallment::getInstallmentNumber).max().orElse(0) + 1);
        moved.setDueDate(LocalDate.now(clock));
        moved.setAmount(amount);
        moved.setStatus(InstallmentStatus.PAID);
        moved.setMovedIn(true);
        moved.setPaidAt(now);
        moved.setRecordedBy(actorId);
        moved.setRecordedAt(now);
        moved.setConfirmedAt(now);
        moved.setConfirmedBy(actorId);
        tgt.add(moved);
        emiInstallmentRepository.saveAll(tgt);
        target.setInstallmentCount((int) tgt.stream().filter(i -> i.getStatus() != InstallmentStatus.VOID).count());
        boolean targetDone = fullyPaid(tgt);
        if (targetDone) {
            target.setStatus(BookingStatus.CONFIRMED);
            target.setConfirmedAt(now);
            targetPlot.setStatus(PlotStatus.SOLD);
            plotRepository.save(targetPlot);
            bookingEventRepository.save(BookingEvent.of(targetId, BookingEventType.CONFIRMED, actorId,
                "fully paid, amount " + target.getTotalAmount().toPlainString(), now));
        }
        plotBookingRepository.save(target);

        // source: take the paid money out
        takePaid(src, amount.add(refunding ? leftover : BigDecimal.ZERO));
        String detail = "moved " + amount.toPlainString() + " from plot " + sourcePlot.getPlotNo() + " to plot " + targetPlot.getPlotNo();
        boolean cancelSource = leftover.signum() == 0 || refunding;
        if (cancelSource) {
            for (EmiInstallment i : src) {
                if (i.getStatus() == InstallmentStatus.PENDING || i.getStatus() == InstallmentStatus.ENTERED) {
                    i.setStatus(InstallmentStatus.VOID);
                }
            }
            source.setStatus(BookingStatus.CANCELLED);
            source.setCancelledAt(now);
            source.setCancelReason(refunding ? request.reason().trim() : "Money moved to plot " + targetPlot.getPlotNo());
            String freed = "";
            if (sourcePlot.getStatus() == PlotStatus.BOOKED
                    && plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(sourcePlot.getId(), sourceId,
                        List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED)).isEmpty()) {
                sourcePlot.setStatus(PlotStatus.AVAILABLE);
                freed = "; plot freed";
            }
            if (refunding) {
                source.setCancellationCharge(request.chargePct(), charge, refund);
                if (!freed.isEmpty()) {
                    String old = sourcePlot.getPlotNo();
                    sourcePlot.setPlotNo(nextCancelledPlotNo(sourcePlot.getProjectId(), old));
                    freed += "; plot renamed " + old + " -> " + sourcePlot.getPlotNo();
                }
                detail += "; charge " + request.chargePct().stripTrailingZeros().toPlainString() + "%: " + charge.toPlainString()
                    + "; refund: " + refund.toPlainString();
                if (refund.signum() > 0) {
                    postRefundExpense(TRANSFER_REFUND_EXPENSE_TYPE, source, sourcePlot, refund, request.payMode(),
                        "Plot " + sourcePlot.getPlotNo() + " cancelled after moving money to " + targetPlot.getPlotNo()
                            + "; booking " + sourceId, actorId);
                }
            }
            plotRepository.save(sourcePlot);
            detail += "; source cancelled" + freed;
        } else {
            detail += "; " + leftover.toPlainString() + " kept on source";
        }
        emiInstallmentRepository.saveAll(src);
        plotBookingRepository.save(source);
        bookingEventRepository.save(BookingEvent.of(sourceId, BookingEventType.MONEY_MOVED, actorId, detail, now));
        bookingEventRepository.save(BookingEvent.of(targetId, BookingEventType.MONEY_MOVED, actorId, detail, now));
        return toResponse(source, src);
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
    public AssociateBookingPageResponse getMyBookings(UUID associateId, LocalDate from, LocalDate to, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(
            associateId, fromInstant(from), toInstant(to), PageRequest.of(page, size));

        List<BookingResponse> bookings = toResponses(result.getContent(), emiInstallmentRepository
            .findByBookingIdInOrderByInstallmentNumberAsc(
                result.getContent().stream().map(PlotBooking::getId).toList()).stream()
            .collect(java.util.stream.Collectors.groupingBy(EmiInstallment::getBookingId)));

        return new AssociateBookingPageResponse(bookings, page, size, result.getTotalElements());
    }

    // position: null = whole team, "L"/"R" = that leg. Scoped to the caller's downline by the query.
    public AssociateBookingPageResponse getTeamBookings(UUID associateId, String position, LocalDate from, LocalDate to, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.findByDownline(associateId, position, fromInstant(from), toInstant(to), PageRequest.of(page, size));
        List<BookingResponse> bookings = toResponses(result.getContent(), emiInstallmentRepository
            .findByBookingIdInOrderByInstallmentNumberAsc(
                result.getContent().stream().map(PlotBooking::getId).toList()).stream()
            .collect(java.util.stream.Collectors.groupingBy(EmiInstallment::getBookingId)))
            ;
        // Associate phone is shown only for associates the caller sponsored (at any depth in the tree).
        Set<UUID> sponsored = new HashSet<>();
        associateRepository.findAllById(bookings.stream().map(BookingResponse::associateId).distinct().toList())
            .forEach(a -> { if (associateId.equals(a.getSponsorId())) sponsored.add(a.getId()); });
        bookings = bookings.stream().map(b -> b.withoutBuyerPhone(sponsored.contains(b.associateId()))).toList();
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

    // Flat, no-interest amortization: BookingEmiConfig carries no down-payment-percentage or
    // interest-rate field (only emiEnabled and defaultInstallmentCount --
    // confirmed by reading the entity directly, not assumed), so
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
        BigDecimal first = firstInstallment == null ? null : firstInstallment.setScale(0, RoundingMode.HALF_UP);
        if (first != null && balanceCount == 1 && first.compareTo(balance) != 0) {
            throw new InvalidFirstInstallmentException(first, balance);
        }
        BigDecimal rest = first == null ? balance : balance.subtract(first);
        int restCount = first == null ? balanceCount : balanceCount - 1;
        BigDecimal base = restCount == 0 ? BigDecimal.ZERO : rest.divide(BigDecimal.valueOf(restCount), 0, RoundingMode.DOWN);

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
        tokenInstallment.setReceiptNo(request.receiptNo() == null || request.receiptNo().isBlank() ? null : request.receiptNo().trim());
        tokenInstallment.setBankName(request.bankName() == null || request.bankName().isBlank() ? null : request.bankName().trim());
        tokenInstallment.setRecordedAt(bookedAt);
        tokenInstallment.setRecordedBy(tokenConfirmedBy);
        schedule.add(tokenInstallment);
        // Token covers the whole total: paid in full, no balance installments.
        if (balance.signum() == 0) { return schedule; }

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
        Map<UUID, Associate> associates = byId(associateRepository.findAllById(
            java.util.stream.Stream.concat(ids(bookings, PlotBooking::getAssociateId).stream(),
                ids(bookings, PlotBooking::getBuyerAssociateId).stream()).distinct().toList()), Associate::getId);
        LocalDate today = LocalDate.now(clock);
        return bookings.stream().map(booking -> {
            List<EmiInstallment> installments = installmentsByBooking.getOrDefault(booking.getId(), List.of());
            List<EmiInstallmentResponse> rows = installments.stream()
                .map(i -> new EmiInstallmentResponse(
                    i.getInstallmentNumber(), i.getAmount(), i.getDueDate(), i.getStatus(), i.getPaidAt(),
                    i.getStatus() == InstallmentStatus.PENDING && i.getDueDate().isBefore(today),
                    i.getPaymentMode(), i.getConfirmedAt(), i.getBankName(), i.getPaymentRef(), i.getRecordedAt(), i.getReceiptNo()))
                .toList();
            Plot plot = plots.get(booking.getPlotId());
            Project project = plot == null ? null : projects.get(plot.getProjectId());
            Associate associate = associates.get(booking.getAssociateId());
            Associate buyer = associates.get(booking.getBuyerAssociateId());
            return new BookingResponse(
                booking.getId(), booking.getPlotId(), booking.getAssociateId(),
                booking.getStatus(), buyer == null ? null : buyer.getName(),
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
                booking.getCancelReason(),
                plot == null ? null : plot.getRoadSizeFt(),
                booking.getCancellationChargePct(), booking.getCancellationCharge(), booking.getRefundAmount(),
                booking.getBuyerAssociateId());
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
