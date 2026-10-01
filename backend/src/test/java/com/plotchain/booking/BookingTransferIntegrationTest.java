package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;

// Real-DB (H2 via Flyway) proof for BookingService.transferBooking (plot-booking unit 7).
@SpringBootTest
@ActiveProfiles("test")
class BookingTransferIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    // Pass-through spy (reset by Spring after each test); Task 3 makes the TRANSFERRED save fail.
    @SpyBean BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID projectId;
    private final List<UUID> associateIds = new ArrayList<>();
    private final List<UUID> plotIds = new ArrayList<>();
    private int plotSeq = 0;

    // booking_emi_config is a shared global singleton: pin MANUAL (so pay never auto-confirms) and restore.
    private Map<String, Object> originalConfig;

    @BeforeEach
    void pinManualConfig() {
        originalConfig = jdbc.queryForMap(
            "SELECT emi_enabled, default_installment_count, confirm_rule, confirm_threshold_percent FROM booking_emi_config");
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = TRUE, default_installment_count = 4, "
            + "confirm_rule = 'MANUAL', confirm_threshold_percent = NULL, updated_at = CURRENT_TIMESTAMP");
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = ?, default_installment_count = ?, "
                + "confirm_rule = ?, confirm_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP",
            originalConfig.get("EMI_ENABLED"), originalConfig.get("DEFAULT_INSTALLMENT_COUNT"),
            originalConfig.get("CONFIRM_RULE"), originalConfig.get("CONFIRM_THRESHOLD_PERCENT"));
        // sale <-> booking FKs are circular: null plot_booking.sale_id first.
        for (UUID a : associateIds) {
            jdbc.update("UPDATE plot_booking SET sale_id = NULL WHERE associate_id = ?", a);
        }
        List<Sale> sales = saleRepository.findAll().stream()
            .filter(s -> associateIds.contains(s.getAssociateId())).toList();
        for (Sale s : sales) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAllBySourceRef(s.getId()));
        }
        saleRepository.deleteAll(sales);
        List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
            .filter(b -> plotIds.contains(b.getPlotId())).toList();
        for (PlotBooking b : bookings) {
            bookingEventRepository.deleteAll(bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId()));
            emiInstallmentRepository.deleteAll(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()));
        }
        plotBookingRepository.deleteAll(bookings);
        plotIds.forEach(plotRepository::deleteById);
        if (projectId != null) projectRepository.deleteById(projectId);
        associateIds.forEach(associateRepository::deleteById);
    }

    // ---- fixtures (copied from BookingConfirmIntegrationTest, parameterised) ----------------------

    private UUID seedPlot() {
        return new TransactionTemplate(transactionManager).execute(s -> {
            if (projectId == null) {
                Project p = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
                projectRepository.saveAndFlush(p);
                projectId = p.getId();
            }
            Plot plot = new Plot(UUID.randomUUID(), projectId, "T-" + (++plotSeq), PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            plotIds.add(plot.getId());
            return plot.getId();
        });
    }

    private UUID seedAssociate(AssociateStatus status) {
        return new TransactionTemplate(transactionManager).execute(s -> {
            UUID id = UUID.randomUUID();
            Associate a = new Associate();
            a.setId(id);
            a.setPosition("L");
            a.setName("Test Associate");
            a.setKycStatus(KycStatus.VERIFIED);
            a.setJoinedAt(Instant.now());
            a.setCumulativeMatchedVolume(BigDecimal.ZERO);
            a.setUserId("u-" + id);
            a.setEmail(id + "@test.local");
            a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
            a.setRole(AssociateRole.ADMIN);
            a.setStatus(status);
            associateRepository.saveAndFlush(a);
            associateIds.add(id);
            return id;
        });
    }

    private BookingResponse seedBooking(UUID ownerId) {
        return bookingService.createBooking(new CreateBookingRequest(seedPlot(), ownerId, "Jane Buyer", null));
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private UUID ownerOf(UUID bookingId) {
        return jdbc.queryForObject("SELECT associate_id FROM plot_booking WHERE id = ?", UUID.class, bookingId);
    }

    private int transferredEvents(UUID bookingId) {
        return count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'TRANSFERRED'", bookingId);
    }

    // ---- happy path ----------------------------------------------------------------------------

    @Test
    void transferReassignsTheBookingKeepsInstallmentsAndPaymentsAndWritesOneTransferredEvent() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        UUID admin = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        BigDecimal amt = b.installments().get(0).amount();
        bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(amt, "UTR-1", null), admin);

        BookingResponse after = bookingService.transferBooking(b.id(), to, admin);

        assertThat(after.associateId()).isEqualTo(to);
        assertThat(after.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(ownerOf(b.id())).isEqualTo(to);
        // installments and the payment carry over untouched
        assertThat(after.installments()).hasSameSizeAs(b.installments());
        assertThat(after.installments().get(0).status()).isEqualTo(InstallmentStatus.PAID);
        assertThat(after.paidAmount()).isEqualByComparingTo(amt);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ?", b.id()))
            .isEqualTo(b.installments().size());
        assertThat(jdbc.queryForObject(
            "SELECT payment_ref FROM emi_installment WHERE booking_id = ? AND installment_number = 1",
            String.class, b.id())).isEqualTo("UTR-1");
        // plot untouched
        assertThat(jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, b.plotId()))
            .isEqualTo("BOOKED");
        // exactly one TRANSFERRED event with actor and from -> to detail
        assertThat(transferredEvents(b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT detail FROM booking_event WHERE booking_id = ? AND type = 'TRANSFERRED'",
            String.class, b.id())).isEqualTo("from " + from + " to " + to);
        assertThat(jdbc.queryForObject(
            "SELECT actor_id FROM booking_event WHERE booking_id = ? AND type = 'TRANSFERRED'",
            UUID.class, b.id())).isEqualTo(admin);
    }

    // ---- 4xx: right exception AND nothing written -------------------------------------------------

    private void assertNothingWritten(UUID bookingId, UUID expectedOwner, int expectedTotalEvents) {
        assertThat(ownerOf(bookingId)).isEqualTo(expectedOwner);
        assertThat(transferredEvents(bookingId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", bookingId))
            .isEqualTo(expectedTotalEvents);
    }

    @Test
    void unknownBookingIs404() {
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        UUID missing = UUID.randomUUID();
        assertThatThrownBy(() -> bookingService.transferBooking(missing, to, to))
            .isInstanceOf(BookingNotFoundException.class);
    }

    @Test
    void confirmedBookingIs409AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        bookingService.confirmBooking(b.id(), from);   // writes 1 CONFIRMED event

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), to, from))
            .isInstanceOf(BookingNotActiveException.class);
        assertNothingWritten(b.id(), from, 1);
    }

    @Test
    void sameAssociateTargetIs400AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), from, from))
            .isInstanceOf(SameAssociateTransferException.class);
        assertNothingWritten(b.id(), from, 0);
    }

    @Test
    void unknownTargetIs404AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), UUID.randomUUID(), from))
            .isInstanceOf(AssociateNotFoundException.class);
        assertNothingWritten(b.id(), from, 0);
    }

    @Test
    void pendingTargetIs400AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID pending = seedAssociate(AssociateStatus.PENDING);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), pending, from))
            .isInstanceOf(InvalidTransferTargetException.class)
            .hasMessageContaining(pending.toString()).hasMessageContaining("PENDING");
        assertNothingWritten(b.id(), from, 0);
    }

    @Test
    void suspendedTargetIs400AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID suspended = seedAssociate(AssociateStatus.SUSPENDED);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), suspended, from))
            .isInstanceOf(InvalidTransferTargetException.class);
        assertNothingWritten(b.id(), from, 0);
    }

    // Order: a non-ACTIVE booking beats a bad target (409 before 404/400).
    @Test
    void notActiveBookingBeatsAnUnknownTarget() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        bookingService.confirmBooking(b.id(), from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), UUID.randomUUID(), from))
            .isInstanceOf(BookingNotActiveException.class);
    }

    // Order: same-associate (400) beats target eligibility, even when the current owner is SUSPENDED
    // after the booking was made.
    @Test
    void sameAssociateBeatsTargetEligibility() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        jdbc.update("UPDATE associate SET status = 'SUSPENDED' WHERE id = ?", from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), from, from))
            .isInstanceOf(SameAssociateTransferException.class);
    }

    // Must-handle (2): confirm credits booking.getAssociateId() at confirm time, so transfer-then-confirm
    // makes the NEW associate the seller and puts the ledger entries on the new associate, none on the old.
    @Test
    void confirmAfterTransferCreatesTheSaleAndLedgerEntriesForTheNewAssociate() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);

        bookingService.transferBooking(b.id(), to, to);
        bookingService.confirmBooking(b.id(), to);

        Sale sale = saleRepository.findAll().stream()
            .filter(s -> b.id().equals(s.getBookingId())).findFirst().orElseThrow();
        assertThat(sale.getAssociateId()).isEqualTo(to);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", from)).isZero();
        assertThat(count("SELECT COUNT(*) FROM ledger_entry WHERE associate_id = ?", from)).isZero();
        // Non-empty guard: the seeded seller does get ledger entries (see BookingConfirmIntegrationTest's
        // parity test), so the allSatisfy below is not vacuous.
        assertThat(ledgerEntryRepository.findAllBySourceRef(sale.getId())).isNotEmpty()
            .allSatisfy(e -> assertThat(e.getAssociateId()).isEqualTo(to));
        assertThat(ownerOf(b.id())).isEqualTo(to);
    }

    // Must-handle (3): own view (GET /api/associates/me/bookings reads getMyBookings) follows the owner.
    @Test
    void afterTransferTheOldAssociateNoLongerSeesTheBookingAndTheNewOneDoes() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        assertThat(bookingService.getMyBookings(from, 0, 10).bookings())
            .extracting(BookingResponse::id).contains(b.id());

        bookingService.transferBooking(b.id(), to, to);

        assertThat(bookingService.getMyBookings(from, 0, 10).bookings())
            .extracting(BookingResponse::id).doesNotContain(b.id());
        assertThat(bookingService.getMyBookings(to, 0, 10).bookings())
            .extracting(BookingResponse::id).contains(b.id());
    }

    // The new owner can be transferred onward (and back): chained transfers each write one event.
    @Test
    void chainedTransfersEachWriteOneEvent() {
        UUID a = seedAssociate(AssociateStatus.ACTIVE);
        UUID c = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(a);
        bookingService.transferBooking(b.id(), c, a);
        bookingService.transferBooking(b.id(), a, a);
        assertThat(ownerOf(b.id())).isEqualTo(a);
        assertThat(transferredEvents(b.id())).isEqualTo(2);
    }

    // The TRANSFERRED event write fails AFTER booking.associate_id was changed and saved, so only the
    // surrounding transaction can undo the reassignment. Boot 3.3.4: @SpyBean.
    @Test
    void aFailureWritingTheTransferredEventRollsTheReassignmentBack() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        doThrow(new IllegalStateException("simulated event failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.TRANSFERRED));

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), to, from))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        // fresh JDBC read (no persistence context)
        assertThat(ownerOf(b.id())).isEqualTo(from);
        assertThat(transferredEvents(b.id())).isZero();
    }

    private void awaitQuietly(CountDownLatch latch) {
        try { latch.await(5, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    // Deterministic lock proof: hold the booking row lock in one transaction; a concurrent transfer must
    // BLOCK until it commits, then see the committed CANCELLED status (409). With findByIdForUpdate swapped
    // for findById it reads the stale ACTIVE row and overwrites the owner (lost update).
    @Test
    void transferBlocksWhileAnotherTransactionHoldsTheBookingLock() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
                PlotBooking locked = plotBookingRepository.findByIdForUpdate(b.id()).orElseThrow();
                // Uncommitted status change: only a transfer that waits for the lock sees it (on H2 even an
                // unlocked read-then-write would block at the UPDATE, so blocking alone proves nothing).
                locked.setStatus(BookingStatus.CANCELLED);
                plotBookingRepository.saveAndFlush(locked);
                lockHeld.countDown();
                awaitQuietly(release);
            }));
            assertThat(lockHeld.await(5, TimeUnit.SECONDS)).isTrue();
            Future<BookingResponse> transfer = pool.submit(() -> bookingService.transferBooking(b.id(), to, from));

            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(500);
            while (System.nanoTime() < deadline) {
                assertThat(transfer.isDone()).as("transfer must wait for the booking lock").isFalse();
                Thread.sleep(20);
            }
            release.countDown();
            holder.get(10, TimeUnit.SECONDS);
            assertThatThrownBy(() -> transfer.get(10, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class).hasCauseInstanceOf(BookingNotActiveException.class);
            assertNothingWritten(b.id(), from, 0);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    // Must-handle (5): transfer racing a manual confirm, repeated. Whichever wins, the invariants hold:
    // the Sale (if any) belongs to the booking's final owner; a transfer that lost is BookingNotActive (409)
    // with no TRANSFERRED event; a transfer that won happened strictly before the confirm.
    @Test
    void transferRacingConfirmNeverLeavesTheSaleCreditedToTheWrongAssociate() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        for (int i = 0; i < 20; i++) {
            BookingResponse b = seedBooking(from);
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            Future<BookingResponse> transfer = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.transferBooking(b.id(), to, from);
            });
            Future<BookingResponse> confirm = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.confirmBooking(b.id(), from);
            });
            start.countDown();
            boolean transferred = true;
            try {
                try {
                    transfer.get(10, TimeUnit.SECONDS);
                } catch (ExecutionException e) {
                    assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
                    transferred = false;
                }
                confirm.get(10, TimeUnit.SECONDS);      // confirm always succeeds: transfer never makes it fail
            } finally {
                pool.shutdownNow();
            }
            UUID owner = ownerOf(b.id());
            assertThat(owner).isEqualTo(transferred ? to : from);
            assertThat(jdbc.queryForObject("SELECT associate_id FROM sale WHERE booking_id = ?", UUID.class, b.id()))
                .as("sale seller must equal the booking's final owner").isEqualTo(owner);
            assertThat(transferredEvents(b.id())).isEqualTo(transferred ? 1 : 0);
        }
    }

    // Transfer racing a pay: both succeed in either order; payment is never lost, owner is the target.
    @Test
    void transferRacingAPayLosesNeitherWrite() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        BigDecimal amt = b.installments().get(0).amount();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> t = pool.submit(() -> { awaitQuietly(start); return bookingService.transferBooking(b.id(), to, from); });
            Future<?> p = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(amt, "UTR-X", null), from);
            });
            start.countDown();
            t.get(10, TimeUnit.SECONDS);
            p.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(ownerOf(b.id())).isEqualTo(to);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 1", String.class, b.id()))
            .isEqualTo("PAID");
        assertThat(transferredEvents(b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(1);
    }

    // Unit 6 is merged: a CANCELLED booking cannot be transferred.
    @Test
    void transferOfACancelledBookingIs409AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("buyer withdrew"), from);   // 1 CANCELLED event

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), to, from))
            .isInstanceOf(BookingNotActiveException.class);
        assertNothingWritten(b.id(), from, 1);
    }

    // Transfer racing cancel: cancel never fails (it does not care who owns the booking); a transfer that
    // loses is BookingNotActive (409) with no TRANSFERRED event and the owner unchanged; one that wins
    // moved the owner. Either way the booking ends CANCELLED and the plot is released.
    @Test
    void transferRacingCancelEndsCancelledWithConsistentOwnerAndEvents() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        for (int i = 0; i < 20; i++) {
            BookingResponse b = seedBooking(from);
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            Future<BookingResponse> transfer = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.transferBooking(b.id(), to, from);
            });
            Future<BookingResponse> cancel = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.cancelBooking(b.id(), new CancelBookingRequest("race"), from);
            });
            start.countDown();
            boolean transferred = true;
            try {
                try {
                    transfer.get(10, TimeUnit.SECONDS);
                } catch (ExecutionException e) {
                    assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
                    transferred = false;
                }
                cancel.get(10, TimeUnit.SECONDS);
            } finally {
                pool.shutdownNow();
            }
            assertThat(ownerOf(b.id())).isEqualTo(transferred ? to : from);
            assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, b.id()))
                .isEqualTo("CANCELLED");
            assertThat(jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, b.plotId()))
                .isEqualTo("AVAILABLE");
            assertThat(transferredEvents(b.id())).isEqualTo(transferred ? 1 : 0);
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id()))
                .isEqualTo(1);
        }
    }
}
