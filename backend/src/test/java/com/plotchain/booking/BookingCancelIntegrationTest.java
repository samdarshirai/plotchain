package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;

// Real-DB (H2 via Flyway) proof for plot-booking unit 6: admin cancel of an ACTIVE booking.
// Harness copied from BookingAutoConfirmIntegrationTest (committed rows, manual cleanup, circular sale<->booking
// FKs nulled first) plus save/restore of the global booking_emi_config singleton.
@SpringBootTest
@ActiveProfiles("test")
class BookingCancelIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    // Pass-through spy (reset by Spring after each test) so one test can make the CANCELLED event write
    // fail AFTER the installments were voided and the plot flipped. Boot 3.3.4: @SpyBean.
    @SpyBean BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID plotId;
    private UUID projectId;
    private UUID associateId;
    private Map<String, Object> originalConfig;

    @BeforeEach
    void saveConfig() {
        originalConfig = jdbc.queryForMap(
            "SELECT emi_enabled, default_installment_count, confirm_rule, confirm_threshold_percent FROM booking_emi_config");
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = ?, default_installment_count = ?, "
                + "confirm_rule = ?, confirm_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP",
            originalConfig.get("EMI_ENABLED"), originalConfig.get("DEFAULT_INSTALLMENT_COUNT"),
            originalConfig.get("CONFIRM_RULE"), originalConfig.get("CONFIRM_THRESHOLD_PERCENT"));
        if (associateId != null) {
            jdbc.update("UPDATE plot_booking SET sale_id = NULL WHERE associate_id = ?", associateId);
            List<Sale> sales = saleRepository.findAll().stream()
                .filter(s -> associateId.equals(s.getAssociateId())).toList();
            for (Sale s : sales) {
                ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAllBySourceRef(s.getId()));
            }
            saleRepository.deleteAll(sales);
            List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
                .filter(b -> associateId.equals(b.getAssociateId())).toList();
            for (PlotBooking b : bookings) {
                bookingEventRepository.deleteAll(bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId()));
                emiInstallmentRepository.deleteAll(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()));
            }
            plotBookingRepository.deleteAll(bookings);
        }
        if (plotId != null) plotRepository.deleteById(plotId);
        if (projectId != null) projectRepository.deleteById(projectId);
        if (associateId != null) associateRepository.deleteById(associateId);
    }

    // Plot price is 600000.00. With emiEnabled=true and count=4 every installment is 150000.00.
    private void setConfig(boolean emiEnabled, int count, String rule, Integer threshold) {
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = ?, default_installment_count = ?, "
                + "confirm_rule = ?, confirm_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP",
            emiEnabled, count, rule, threshold);
    }

    private UUID seedAvailablePlot() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
            projectRepository.saveAndFlush(project);
            projectId = project.getId();
            Plot plot = new Plot(UUID.randomUUID(), project.getId(), "A-101", PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            return plot.getId();
        });
    }

    private UUID seedAssociate() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            UUID id = UUID.randomUUID();
            Associate associate = new Associate();
            associate.setId(id);
            associate.setPosition("L");
            associate.setName("Test Associate");
            associate.setKycStatus(KycStatus.VERIFIED);
            associate.setJoinedAt(Instant.now());
            associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
            associate.setUserId("u-" + id);
            associate.setEmail(id + "@test.local");
            associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
            // ADMIN, not ASSOCIATE: chk_associate_rank_required (V4) demands a rank_id for ASSOCIATE rows;
            // this row is also the FK-satisfying actor.
            associate.setRole(AssociateRole.ADMIN);
            associateRepository.saveAndFlush(associate);
            return id;
        });
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // Config MUST be set before this: the schedule is generated from the config at booking time.
    private BookingResponse seedBooking() {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();
        return LegacyScheduleSeed.book(bookingService, jdbc, plotId, associateId, "Jane Buyer");
    }

    private BookingResponse payInstallment(BookingResponse b, int n) {
        BigDecimal amount = b.installments().get(n - 1).amount();
        return bookingService.recordPayment(b.id(), n, new RecordPaymentRequest(amount, "UTR-" + n, null), associateId);
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private String bookingStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, id);
    }

    private String plotStatus() {
        return jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, plotId);
    }

    private String eventDetail(UUID bookingId, String type) {
        return jdbc.queryForObject(
            "SELECT detail FROM booking_event WHERE booking_id = ? AND type = ?", String.class, bookingId, type);
    }

    @Test
    void cancelPersistsEverythingAndLeavesPaidInstallmentsUntouched() {
        setConfig(true, 4, "MANUAL", null);                       // 4 x 150000.00
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        payInstallment(b, 3);                                      // out of order is fine

        BookingResponse after = bookingService.cancelBooking(b.id(), new CancelBookingRequest("  buyer withdrew "), associateId);

        assertThat(after.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(after.paidAmount()).isEqualByComparingTo("300000.00");
        assertThat(after.dueAmount()).isEqualByComparingTo("0");
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, cancelled_at, cancel_reason, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("STATUS")).isEqualTo("CANCELLED");
        assertThat(row.get("CANCELLED_AT")).isNotNull();
        assertThat(row.get("CANCEL_REASON")).isEqualTo("buyer withdrew");
        assertThat(row.get("CONFIRMED_AT")).isNull();
        assertThat(row.get("SALE_ID")).isNull();
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isZero();
        // PAID rows keep their payment fields
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID' AND payment_ref IS NOT NULL AND paid_at IS NOT NULL", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED' AND actor_id = ?", b.id(), associateId)).isEqualTo(1);
        assertThat(eventDetail(b.id(), "CANCELLED")).isEqualTo("reason: buyer withdrew; paid: 300000.00");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
    }

    @Test
    void a255CharReasonFitsTheEventDetailColumnEvenWithTheLongestSuffix() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        reBookUnderneath(b);                                       // forces the longest suffix: plot kept: held by booking <uuid>
        String reason = "r".repeat(255);

        bookingService.cancelBooking(b.id(), new CancelBookingRequest(reason), associateId);

        assertThat(eventDetail(b.id(), "CANCELLED")).startsWith("reason: " + reason).contains("plot kept: held by booking");
        assertThat(jdbc.queryForObject("SELECT cancel_reason FROM plot_booking WHERE id = ?", String.class, b.id())).hasSize(255);
    }

    @Test
    void cancelOfAConfirmedBookingIs409AndChangesNothing() {
        setConfig(false, 1, "MANUAL", null);
        BookingResponse b = seedBooking();
        bookingService.confirmBooking(b.id(), associateId);

        assertThatThrownBy(() -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId))
            .isInstanceOf(BookingNotActiveException.class);
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
    }

    @Test
    void cancelOfAnAlreadyCancelledBookingIs409AndWritesNoSecondEvent() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("first"), associateId);

        assertThatThrownBy(() -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("second"), associateId))
            .isInstanceOf(BookingNotActiveException.class);
        assertThat(jdbc.queryForObject("SELECT cancel_reason FROM plot_booking WHERE id = ?", String.class, b.id())).isEqualTo("first");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isEqualTo(1);
    }

    @Test
    void cancelOfAnUnknownBookingIs404() {
        assertThatThrownBy(() -> bookingService.cancelBooking(UUID.randomUUID(), new CancelBookingRequest("x"), UUID.randomUUID()))
            .isInstanceOf(BookingNotFoundException.class);
    }

    // Decision (plan): plot drift never blocks cancel.
    @Test
    void cancelWithASoldPlotSucceedsAndLeavesThePlotSold() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        jdbc.update("UPDATE plot SET status = 'SOLD' WHERE id = ?", plotId);

        bookingService.cancelBooking(b.id(), new CancelBookingRequest("drift"), associateId);

        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("; plot left SOLD");
    }

    @Test
    void cancelWithAnAvailablePlotSucceedsAndLeavesThePlotAvailable() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);

        bookingService.cancelBooking(b.id(), new CancelBookingRequest("drift"), associateId);

        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("; plot left AVAILABLE");
    }

    // After cancel, the existing pay guard (booking not ACTIVE) rejects every pay: the VOID installment
    // can never be paid, nothing is written.
    // Stale-booking guard, real DB. A is ACTIVE; the plot is then (manually) freed and re-booked by B,
    // leaving A stale on a plot B holds. Cancelling A must not free B's plot.
    private BookingResponse reBookUnderneath(BookingResponse a) {
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);
        return LegacyScheduleSeed.book(bookingService, jdbc, plotId, associateId, "Buyer B");
    }

    @Test
    void cancellingAStaleBookingDoesNotFreeAPlotHeldByAnotherActiveBooking() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse a = seedBooking();
        BookingResponse b = reBookUnderneath(a);                  // plot BOOKED by B (ACTIVE)

        bookingService.cancelBooking(a.id(), new CancelBookingRequest("stale"), associateId);

        assertThat(bookingStatus(a.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("BOOKED");             // NOT freed
        assertThat(eventDetail(a.id(), "CANCELLED")).endsWith("; plot kept: held by booking " + b.id());
        // B completely untouched
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isEqualTo(4);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", b.id())).isZero();
        // and B can still be cancelled normally, which now frees the plot
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("ok"), associateId);
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    void cancellingAStaleBookingDoesNotFreeAPlotHeldByAConfirmedBooking() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse a = seedBooking();
        BookingResponse b = reBookUnderneath(a);
        // CONFIRMED holder while the plot is still BOOKED (hand-set; a real confirm would make it SOLD,
        // which is the separate "plot left SOLD" path already covered above)
        jdbc.update("UPDATE plot_booking SET status = 'CONFIRMED' WHERE id = ?", b.id());

        bookingService.cancelBooking(a.id(), new CancelBookingRequest("stale"), associateId);

        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(eventDetail(a.id(), "CANCELLED")).endsWith("; plot kept: held by booking " + b.id());
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
    }

    @Test
    void aCancelledOtherBookingOnThePlotDoesNotCountAsAHolder() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse a = seedBooking();
        BookingResponse b = reBookUnderneath(a);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("b out"), associateId);   // frees plot
        jdbc.update("UPDATE plot SET status = 'BOOKED' WHERE id = ?", plotId);                  // A stale again

        bookingService.cancelBooking(a.id(), new CancelBookingRequest("a out"), associateId);

        assertThat(plotStatus()).isEqualTo("AVAILABLE");          // only a CANCELLED booking remains
        assertThat(eventDetail(a.id(), "CANCELLED")).doesNotContain("plot kept");
    }

    @Test
    void payAfterCancelIs409ForVoidAndPaidInstallmentsAndWritesNothing() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId);
        int paidEventsBefore = count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id());

        assertThatThrownBy(() -> payInstallment(b, 2)).isInstanceOf(BookingNotActiveException.class);   // VOID row
        assertThatThrownBy(() -> payInstallment(b, 1)).isInstanceOf(BookingNotActiveException.class);   // PAID row
        assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isEqualTo("VOID");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(paidEventsBefore);
    }

    @Test
    void confirmAfterCancelIs409AndCreatesNoSale() {
        setConfig(false, 1, "MANUAL", null);
        BookingResponse b = seedBooking();
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId);

        assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId)).isInstanceOf(BookingNotActiveException.class);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    void theFreedPlotCanBeBookedAgainAndTheCancelledBookingStaysCancelled() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse first = seedBooking();
        bookingService.cancelBooking(first.id(), new CancelBookingRequest("x"), associateId);

        BookingResponse second = LegacyScheduleSeed.book(bookingService, jdbc, plotId, associateId, "New Buyer");

        assertThat(second.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(second.installments()).hasSize(4).allMatch(i -> i.status() == InstallmentStatus.PENDING);
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(bookingStatus(first.id())).isEqualTo("CANCELLED");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", first.id())).isEqualTo(4);
        // and the new booking can itself be cancelled (full cycle)
        bookingService.cancelBooking(second.id(), new CancelBookingRequest("again"), associateId);
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    // Real rollback proof. The CANCELLED event write is the LAST write, so it fails AFTER the installments
    // were voided, the plot flipped to AVAILABLE and the booking row set to CANCELLED. Only the
    // surrounding transaction can undo them. Reads are fresh JDBC (no persistence context).
    @Test
    void aFailureAfterTheInstallmentsAreVoidedAndThePlotFlippedRollsTheWholeCancelBack() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        doThrow(new IllegalStateException("simulated event write failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.CANCELLED));

        assertThatThrownBy(() -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isEqualTo(3);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id())).isEqualTo(1);
        assertThat(plotStatus()).isEqualTo("BOOKED");
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, cancelled_at, cancel_reason FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("STATUS")).isEqualTo("ACTIVE");
        assertThat(row.get("CANCELLED_AT")).isNull();
        assertThat(row.get("CANCEL_REASON")).isNull();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
        // booking still cancellable afterwards (nothing left half-done / lock released)
        org.mockito.Mockito.reset(bookingEventRepository);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("retry"), associateId);
        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
    }

    // Helper: run two callables at the same instant; returns each outcome (null = success, else the cause).
    private List<Throwable> race(java.util.concurrent.Callable<?> a, java.util.concurrent.Callable<?> b) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> fs = new ArrayList<>();
            for (java.util.concurrent.Callable<?> c : List.of(a, b)) {
                fs.add(pool.submit(() -> { awaitQuietly(start); return c.call(); }));
            }
            start.countDown();
            List<Throwable> out = new ArrayList<>();
            for (Future<?> f : fs) {
                try { f.get(10, TimeUnit.SECONDS); out.add(null); }
                catch (ExecutionException e) { out.add(e.getCause()); }
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    @RepeatedTest(10)
    void twoSimultaneousCancelsYieldExactlyOneWinnerAndOneEvent() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("A"), associateId),
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("B"), associateId));

        assertThat(r.stream().filter(java.util.Objects::isNull)).hasSize(1);
        assertThat(r.stream().filter(java.util.Objects::nonNull)).hasSize(1)
            .allSatisfy(t -> assertThat(t).isInstanceOf(BookingNotActiveException.class));
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isEqualTo(1);
        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isEqualTo(3);
    }

    // Cancel vs manual confirm: exactly one winner, state consistent with the winner.
    @RepeatedTest(10)
    void aCancelRacingAManualConfirmYieldsExactlyOneWinner() throws Exception {
        setConfig(false, 1, "MANUAL", null);
        BookingResponse b = seedBooking();

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId),
            () -> bookingService.confirmBooking(b.id(), associateId));

        boolean cancelWon = r.get(0) == null;
        boolean confirmWon = r.get(1) == null;
        assertThat(cancelWon ^ confirmWon).as("exactly one winner").isTrue();
        Throwable loser = cancelWon ? r.get(1) : r.get(0);
        assertThat(loser).isInstanceOf(BookingNotActiveException.class);
        if (cancelWon) {
            assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
            assertThat(plotStatus()).isEqualTo("AVAILABLE");
            assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isZero();
        } else {
            assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
            assertThat(plotStatus()).isEqualTo("SOLD");
            assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
        }
    }

    // Cancel vs a pay that auto-confirms (single installment, AUTO_THRESHOLD 100): exactly one winner.
    // Exercises booking -> plot lock order from both sides (pay's auto-confirm and cancel both take the
    // plot lock after the booking lock): a lock-order inversion would deadlock/time out here.
    @RepeatedTest(10)
    void aCancelRacingAnAutoConfirmingPayYieldsExactlyOneWinner() throws Exception {
        setConfig(false, 1, "AUTO_THRESHOLD", 100);
        BookingResponse b = seedBooking();
        BigDecimal total = b.installments().get(0).amount();

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId),
            () -> bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(total, "UTR-R", null), associateId));

        boolean cancelWon = r.get(0) == null;
        boolean payWon = r.get(1) == null;
        assertThat(cancelWon ^ payWon).as("exactly one winner").isTrue();
        assertThat(cancelWon ? r.get(1) : r.get(0)).isInstanceOf(BookingNotActiveException.class);
        if (cancelWon) {
            assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
            assertThat(plotStatus()).isEqualTo("AVAILABLE");
            assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ?", String.class, b.id())).isEqualTo("VOID");
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isZero();
            assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
        } else {
            assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
            assertThat(plotStatus()).isEqualTo("SOLD");
            assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ?", String.class, b.id())).isEqualTo("PAID");
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
        }
    }

    // Cancel vs a plain pay under MANUAL: pay-then-cancel legitimately BOTH succeed (the paid installment
    // is retained), cancel-then-pay is 409 for the pay. Invariant under every interleaving: no lost
    // update. The cancel event's "paid" total equals the final sum of PAID installments, and PAID events
    // match PAID rows.
    @RepeatedTest(10)
    void aCancelRacingAPlainPayNeverLosesTheUpdate() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        BigDecimal amount = b.installments().get(0).amount();

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId),
            () -> bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(amount, "UTR-R", null), associateId));

        assertThat(r.get(0)).as("cancel always succeeds on an ACTIVE booking").isNull();
        if (r.get(1) != null) {
            assertThat(r.get(1)).isInstanceOf(BookingNotActiveException.class);
        }
        int paidRows = count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id());
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(paidRows);
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("paid: " + (paidRows == 1 ? "150000.00" : "0.00"));
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isEqualTo(3 + (1 - paidRows));
        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    // Deterministic proof the booking is read WITH the lock (the races above can pass by luck without it).
    // A holder transaction takes the booking lock and sets CONFIRMED (simulating a confirm that commits
    // first). cancel must park on the lock, then see CONFIRMED and 409, and must NOT have touched the plot.
    // Same polling pattern as BookingConfirmIntegrationTest.confirmWaitsForAHolderOfTheBookingLock...
    @Test
    void cancelWaitsForAHolderOfTheBookingLockAndThenSeesItsCommittedState() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        AtomicReference<Thread> cancelThread = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        try {
            Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
                PlotBooking locked = plotBookingRepository.findByIdForUpdate(b.id()).orElseThrow();
                locked.setStatus(BookingStatus.CONFIRMED);
                plotBookingRepository.save(locked);
                lockHeld.countDown();
                awaitQuietly(releaseLock);
            }));
            assertThat(lockHeld.await(5, TimeUnit.SECONDS)).isTrue();

            Future<BookingResponse> cancel = pool.submit(() -> {
                cancelThread.set(Thread.currentThread());
                return bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId);
            });
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                Thread t = cancelThread.get();
                if (t != null && (t.getState() == Thread.State.WAITING || t.getState() == Thread.State.TIMED_WAITING
                        || t.getState() == Thread.State.BLOCKED)) {
                    break;
                }
                Thread.sleep(5);
            }
            assertThat(cancel.isDone()).as("cancel must still be waiting on the holder's lock").isFalse();

            releaseLock.countDown();
            holder.get(5, TimeUnit.SECONDS);
            assertThatThrownBy(() -> cancel.get(10, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class).hasCauseInstanceOf(BookingNotActiveException.class);
        } finally {
            pool.shutdownNow();
        }
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
    }

    // Deterministic proof cancel takes the PLOT lock too (the booking-lock races above all serialize on the
    // booking row and would stay green without it). A holder transaction locks ONLY the plot row (never the
    // booking); cancel must park on it. If flipToSold, the holder also marks the plot SOLD before commit,
    // which proves cancel reads the plot AFTER acquiring the lock (a pre-lock read would see BOOKED and
    // overwrite the SOLD status with AVAILABLE).
    private void cancelWhileAnotherTransactionHoldsThePlotLock(UUID bookingId, boolean flipToSold) throws Exception {
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        AtomicReference<Thread> cancelThread = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        try {
            Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
                Plot locked = plotRepository.findByIdForUpdate(plotId).orElseThrow();
                if (flipToSold) {
                    locked.setStatus(PlotStatus.SOLD);
                    plotRepository.saveAndFlush(locked);
                }
                lockHeld.countDown();
                awaitQuietly(releaseLock);
            }));
            assertThat(lockHeld.await(5, TimeUnit.SECONDS)).isTrue();

            Future<BookingResponse> cancel = pool.submit(() -> {
                cancelThread.set(Thread.currentThread());
                return bookingService.cancelBooking(bookingId, new CancelBookingRequest("x"), associateId);
            });
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                Thread t = cancelThread.get();
                if (cancel.isDone() || (t != null && (t.getState() == Thread.State.WAITING
                        || t.getState() == Thread.State.TIMED_WAITING || t.getState() == Thread.State.BLOCKED))) {
                    break;
                }
                Thread.sleep(5);
            }
            assertThat(cancel.isDone()).as("cancel must still be waiting on the holder's plot lock").isFalse();

            releaseLock.countDown();
            holder.get(5, TimeUnit.SECONDS);
            cancel.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void cancelWaitsForAHolderOfThePlotLockAndThenFreesThePlot() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();

        cancelWhileAnotherTransactionHoldsThePlotLock(b.id(), false);

        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    void cancelReadsThePlotAfterTheLockSoAHoldersSoldStatusIsNeverOverwritten() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();

        cancelWhileAnotherTransactionHoldsThePlotLock(b.id(), true);

        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("; plot left SOLD");
    }
}
