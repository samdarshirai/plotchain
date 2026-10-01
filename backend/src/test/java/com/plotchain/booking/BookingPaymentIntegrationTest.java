package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
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

// Real-DB (H2 via Flyway) proof for BookingService.recordPayment: persisted columns, the single
// PAID event, rollback on a rejected pay, and the booking row lock serializing concurrent pays.
// Harness mirrors BookingConcurrencyTest (committed rows, manual cleanup, events deleted first).
@SpringBootTest
@ActiveProfiles("test")
class BookingPaymentIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID plotId;
    private UUID projectId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        if (associateId != null) {
            List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
                .filter(b -> associateId.equals(b.getAssociateId())).toList();
            for (PlotBooking booking : bookings) {
                bookingEventRepository.deleteAll(
                    bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(booking.getId()));
                emiInstallmentRepository.deleteAll(
                    emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()));
            }
            plotBookingRepository.deleteAll(bookings);
        }
        if (plotId != null) plotRepository.deleteById(plotId);
        if (projectId != null) projectRepository.deleteById(projectId);
        if (associateId != null) associateRepository.deleteById(associateId);
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
            // ADMIN, not ASSOCIATE: chk_associate_rank_required (V4) demands a rank_id for any
            // ASSOCIATE row; this test only needs a persistable, FK-satisfying row (also the actor).
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

    private BookingResponse seedBooking() {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();
        return bookingService.createBooking(new CreateBookingRequest(plotId, associateId, "Jane Buyer", null));
    }

    private int lastInstallmentNumber(BookingResponse b) {
        return b.installments().get(b.installments().size() - 1).installmentNumber();
    }

    private BigDecimal lastInstallmentAmount(BookingResponse b) {
        return b.installments().get(b.installments().size() - 1).amount();
    }

    @Test
    void payPersistsInstallmentFieldsAndExactlyOnePaidEventInTheDatabase() {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);   // last first: proves out-of-order against the real DB

        BookingResponse after = bookingService.recordPayment(b.id(), n,
            new RecordPaymentRequest(lastInstallmentAmount(b), "UTR-7", null), associateId);

        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, paid_at, payment_ref, recorded_by FROM emi_installment WHERE booking_id = ? AND installment_number = ?",
            b.id(), n);
        assertThat(row.get("status")).isEqualTo("PAID");
        assertThat(row.get("paid_at")).isNotNull();
        assertThat(row.get("payment_ref")).isEqualTo("UTR-7");
        assertThat(row.get("recorded_by")).isEqualTo(associateId);
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID' AND actor_id = ?",
            Integer.class, b.id(), associateId)).isEqualTo(1);
        assertThat(after.paidAmount()).isEqualByComparingTo(lastInstallmentAmount(b));
        assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, b.id()))
            .isEqualTo("ACTIVE");          // pay never confirms (units 4/5)
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.BOOKED);
    }

    @Test
    void rejectedPayLeavesNoEventAndNoPaidInstallment() {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);

        assertThatThrownBy(() -> bookingService.recordPayment(b.id(), n,
            new RecordPaymentRequest(new BigDecimal("0.01"), "UTR-X", null), associateId))
            .isInstanceOf(PaymentAmountMismatchException.class);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?",
            Integer.class, b.id())).isZero();
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'",
            Integer.class, b.id())).isZero();
    }

    @Test
    void twoSimultaneousPaysOnTheSameInstallmentSucceedExactlyOnce() throws Exception {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);
        BigDecimal amount = lastInstallmentAmount(b);

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<BookingResponse>> results = new ArrayList<>();
        for (String ref : List.of("REF-A", "REF-B")) {
            results.add(pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.recordPayment(b.id(), n, new RecordPaymentRequest(amount, ref, null), associateId);
            }));
        }
        start.countDown();

        int ok = 0;
        int conflicts = 0;
        for (Future<BookingResponse> f : results) {
            try {
                f.get(10, TimeUnit.SECONDS);
                ok++;
            } catch (ExecutionException e) {
                assertThat(e.getCause()).isInstanceOf(InstallmentNotPayableException.class);   // -> 409
                conflicts++;
            }
        }
        pool.shutdownNow();

        assertThat(ok).isEqualTo(1);
        assertThat(conflicts).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'",
            Integer.class, b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT payment_ref FROM emi_installment WHERE booking_id = ? AND installment_number = ?",
            String.class, b.id(), n)).isIn("REF-A", "REF-B");
    }

    @Test
    void payBlocksWhileAnotherTransactionHoldsTheBookingLockThenProceeds() throws Exception {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);
        BigDecimal amount = lastInstallmentAmount(b);

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
            plotBookingRepository.findByIdForUpdate(b.id()).orElseThrow();
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));
        lockHeld.await(5, TimeUnit.SECONDS);

        Future<BookingResponse> pay = pool.submit(() -> {
            events.add("pay-calling");
            BookingResponse r = bookingService.recordPayment(b.id(), n,
                new RecordPaymentRequest(amount, "UTR-L", null), associateId);
            events.add("pay-returned");
            return r;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "pay-calling");   // pay is blocked on the row lock

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        pay.get(5, TimeUnit.SECONDS);
        assertThat(events).containsExactly("holder-locked", "pay-calling", "pay-returned");
        pool.shutdownNow();
    }
}
