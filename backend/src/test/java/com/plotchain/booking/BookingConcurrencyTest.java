package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.payments.BookingEmiConfigRepository;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Exercises the row-lock/serialization mechanism BookingService.createBooking uses, same
// PlotRepository.findByIdForUpdate this codebase already added for Sales unit 3's identical
// double-sell race (SaleRecordConcurrencyTest is this test's direct template). Two concurrent
// POST /api/admin/bookings requests against the same plot must not both pass the AVAILABLE
// check before either commits -- a double-booked plot and an over-generated EMI schedule.
@SpringBootTest
@ActiveProfiles("test")
class BookingConcurrencyTest {

    @Autowired BookingService bookingService;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired BookingEmiConfigRepository bookingEmiConfigRepository;
    @Autowired PlatformTransactionManager transactionManager;

    private UUID plotId;
    private UUID projectId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        // Delete child rows first: the "succeeds" test lets a real createBooking() commit a
        // PlotBooking (FK -> plot, associate) and its EmiInstallment rows (FK -> plot_booking).
        if (associateId != null) {
            List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
                .filter(b -> associateId.equals(b.getAssociateId())).toList();
            for (PlotBooking booking : bookings) {
                List<EmiInstallment> installments = emiInstallmentRepository
                    .findByBookingIdOrderByInstallmentNumberAsc(booking.getId());
                emiInstallmentRepository.deleteAll(installments);
            }
            plotBookingRepository.deleteAll(bookings);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
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
            // ADMIN, not ASSOCIATE: same reasoning as SaleRecordConcurrencyTest.seedAssociate --
            // chk_associate_rank_required (V4) demands a rank_id for any ASSOCIATE row, and this
            // test only needs a persistable, FK-satisfying associate row to exercise the Plot
            // row lock, not a real rank-tiered associate.
            associate.setRole(AssociateRole.ADMIN);
            associateRepository.saveAndFlush(associate);
            return id;
        });
    }

    private CreateBookingRequest bookingRequestFor(UUID plotId, UUID associateId) {
        return new CreateBookingRequest(plotId, associateId);
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void secondCreateBookingBlocksUntilFirstTransactionResolvesThenSucceedsIfPlotIsStillAvailable() throws Exception {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            plotRepository.findByIdForUpdate(plotId).orElseThrow();
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<BookingResponse> second = pool.submit(() -> {
            events.add("second-calling");
            BookingResponse response = bookingService.createBooking(bookingRequestFor(plotId, associateId));
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        BookingResponse response = second.get(5, TimeUnit.SECONDS);

        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.plotId()).isEqualTo(plotId);
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.BOOKED);
    }

    @Test
    void secondCreateBookingBlocksUntilFirstTransactionResolvesThenGetsPlotNotAvailableIfFirstBookedThePlot() throws Exception {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            Plot locked = plotRepository.findByIdForUpdate(plotId).orElseThrow();
            // Stands in for a real first createBooking call's Plot -> BOOKED flip
            // (BookingService.java), which happens inside the same locked transaction in
            // production code.
            locked.setStatus(PlotStatus.BOOKED);
            plotRepository.save(locked);
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<BookingResponse> second = pool.submit(() -> {
            events.add("second-calling");
            BookingResponse response = bookingService.createBooking(bookingRequestFor(plotId, associateId));
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);

        assertThatThrownBy(second::get).hasCauseInstanceOf(PlotNotAvailableException.class);
        pool.shutdownNow();
    }
}
