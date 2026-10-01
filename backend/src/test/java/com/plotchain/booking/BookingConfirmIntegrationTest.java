package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.CreateSaleRequest;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import com.plotchain.sales.SaleStatus;
import com.plotchain.sales.VoidSaleRequest;
import org.junit.jupiter.api.AfterEach;
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
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;

// Real-DB (H2 via Flyway) proof for BookingService.confirmBooking (plot-booking unit 4): linked
// sale, parity with recordSale, void, rollback, and the booking row lock serializing confirms.
@SpringBootTest
@ActiveProfiles("test")
class BookingConfirmIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleService saleService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    // Spy (pass-through by default, reset after each test) so one test can make the CONFIRMED event
    // write fail AFTER the sale insert and plot flip, proving confirmBooking is one transaction.
    @SpyBean BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID plotId;
    private UUID secondPlotId;      // only the parity test sets this
    private UUID projectId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        if (associateId != null) {
            // The sale <-> booking FKs are circular (sale.booking_id -> plot_booking,
            // plot_booking.sale_id -> sale): null the booking side first, then delete in
            // dependency order (ledger -> sale -> events/installments -> booking).
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
        if (secondPlotId != null) plotRepository.deleteById(secondPlotId);
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

    private UUID seedSecondAvailablePlot() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            Plot plot = new Plot(UUID.randomUUID(), projectId, "A-102", PlotType.NORMAL,
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

    @Test
    void confirmPersistsLinkedSaleSoldPlotConfirmedBookingAndOneConfirmedEvent() {
        BookingResponse b = seedBooking();

        BookingResponse after = bookingService.confirmBooking(b.id(), associateId);

        assertThat(after.status()).isEqualTo(BookingStatus.CONFIRMED);
        Sale sale = saleRepository.findAll().stream()
            .filter(s -> b.id().equals(s.getBookingId())).findFirst().orElseThrow();
        assertThat(sale.getAmount()).isEqualByComparingTo("600000.00");
        assertThat(sale.getBuyerName()).isEqualTo("Jane Buyer");
        assertThat(sale.getPlotId()).isEqualTo(plotId);
        assertThat(sale.getNote()).isEqualTo("Confirmed from booking " + b.id());
        assertThat(sale.getStatus()).isEqualTo(SaleStatus.RECORDED);
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.SOLD);

        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("status")).isEqualTo("CONFIRMED");
        assertThat(row.get("confirmed_at")).isNotNull();
        assertThat(row.get("sale_id")).isEqualTo(sale.getId());
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED' AND actor_id = ?",
            Integer.class, b.id(), associateId)).isEqualTo(1);
    }

    // Parity (spec correction: there is no sale-time leg-volume logic; parity is legCredited,
    // cycleId and the ledger). Same associate, same price -> same effects as recordSale.
    @Test
    void confirmedBookingSaleMatchesRecordSaleOnLegCreditedCycleAndLedger() {
        BookingResponse b = seedBooking();
        secondPlotId = seedSecondAvailablePlot();

        bookingService.confirmBooking(b.id(), associateId);
        SaleResponse direct = saleService.recordSale(new CreateSaleRequest(
            secondPlotId, associateId, "Jane Buyer", null, null, projectId,
            new BigDecimal("600000.00"), "parity"));

        Sale viaBooking = saleRepository.findAll().stream()
            .filter(s -> b.id().equals(s.getBookingId())).findFirst().orElseThrow();
        Sale viaRecordSale = saleRepository.findById(direct.id()).orElseThrow();

        assertThat(ledgerShape(viaBooking.getId())).isNotEmpty();
        assertThat(viaBooking.getLegCredited()).isEqualTo(viaRecordSale.getLegCredited());
        assertThat(viaBooking.getCycleId()).isEqualTo(viaRecordSale.getCycleId());
        assertThat(ledgerShape(viaBooking.getId())).isEqualTo(ledgerShape(viaRecordSale.getId()));
    }

    // income type -> "gross/net/status", sorted, so the comparison is independent of row order
    private List<String> ledgerShape(UUID saleId) {
        return ledgerEntryRepository.findAllBySourceRef(saleId).stream()
            .map(e -> e.getIncomeType() + "/" + e.getGrossAmount().stripTrailingZeros().toPlainString()
                + "/" + e.getNetAmount().stripTrailingZeros().toPlainString() + "/" + e.getStatus())
            .sorted().toList();
    }

    @Test
    void voidingTheLinkedSaleReturnsThePlotToAvailableAndLeavesTheBookingConfirmed() {
        BookingResponse b = seedBooking();
        bookingService.confirmBooking(b.id(), associateId);
        UUID saleId = plotBookingRepository.findById(b.id()).orElseThrow().getSaleId();

        saleService.voidSale(saleId, new VoidSaleRequest("test void"));

        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        assertThat(plotBookingRepository.findById(b.id()).orElseThrow().getStatus()).isEqualTo(BookingStatus.CONFIRMED); // Decision 3
        assertThat(saleRepository.findById(saleId).orElseThrow().getStatus()).isEqualTo(SaleStatus.VOIDED);
        assertThat(ledgerEntryRepository.findAllBySourceRef(saleId)).isNotEmpty()
            .allMatch(e -> e.getStatus() == LedgerEntryStatus.REVERSED);
        // A voided linked sale keeps sale.booking_id, and the booking is not ACTIVE, so it cannot be re-confirmed.
        assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
            .isInstanceOf(BookingNotActiveException.class);
    }

    @Test
    void confirmingAnAlreadyConfirmedBookingIs409AndStillExactlyOneSale() {
        BookingResponse b = seedBooking();
        bookingService.confirmBooking(b.id(), associateId);

        assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
            .isInstanceOf(BookingNotActiveException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'",
            Integer.class, b.id())).isEqualTo(1);
    }

    // Real rollback proof: the CONFIRMED event write fails AFTER recordConfirmedBooking has inserted the
    // sale + ledger rows and flipped the plot to SOLD, so only the surrounding transaction can undo them.
    @Test
    void aFailureAfterTheSaleIsCreatedRollsTheWholeConfirmBack() {
        BookingResponse b = seedBooking();
        doThrow(new IllegalStateException("simulated event write failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.CONFIRMED));

        assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        // fresh reads via JDBC (no persistence context involved)
        assertThat(jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, plotId)).isEqualTo("BOOKED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE associate_id = ?", Integer.class, associateId)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_entry WHERE associate_id = ?", Integer.class, associateId)).isZero();
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("status")).isEqualTo("ACTIVE");
        assertThat(row.get("confirmed_at")).isNull();
        assertThat(row.get("sale_id")).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'",
            Integer.class, b.id())).isZero();
    }

    // Data drift: plot edited away from BOOKED while the booking is ACTIVE. Must 409 and write nothing.
    // (Fails fast before any write, so this does NOT prove rollback; see the test above for that.)
    @Test
    void confirmWithAPlotThatIsNoLongerBookedIs409AndWritesNothing() {
        BookingResponse b = seedBooking();
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);

        assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
            .isInstanceOf(PlotNotAvailableException.class);

        assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, b.id())).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT sale_id FROM plot_booking WHERE id = ?", UUID.class, b.id())).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", Integer.class, b.id())).isZero();
    }

    @Test
    void confirmOfAnUnknownBookingIs404() {
        assertThatThrownBy(() -> bookingService.confirmBooking(UUID.randomUUID(), UUID.randomUUID()))
            .isInstanceOf(BookingNotFoundException.class);
    }

    @Test
    void twoSimultaneousConfirmsYieldExactlyOneSale() throws Exception {
        BookingResponse b = seedBooking();

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<BookingResponse>> results = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            results.add(pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.confirmBooking(b.id(), associateId);
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
                // loser re-reads CONFIRMED after the booking lock releases -> 409. Not a unique-index
                // violation: the booking lock serializes them before the sale insert is ever attempted.
                assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
                conflicts++;
            }
        }
        pool.shutdownNow();

        assertThat(ok).isEqualTo(1);
        assertThat(conflicts).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'",
            Integer.class, b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_entry WHERE source_ref IN (SELECT id FROM sale WHERE booking_id = ?) AND income_type = 'DIRECT'",
            Integer.class, b.id())).isEqualTo(1);
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.SOLD);
    }

    @Test
    void confirmBlocksWhileAnotherTransactionHoldsTheBookingLockThenProceeds() throws Exception {
        BookingResponse b = seedBooking();
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

        Future<BookingResponse> confirm = pool.submit(() -> {
            events.add("confirm-calling");
            BookingResponse r = bookingService.confirmBooking(b.id(), associateId);
            events.add("confirm-returned");
            return r;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "confirm-calling");   // blocked on the booking lock

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        confirm.get(5, TimeUnit.SECONDS);
        assertThat(events).containsExactly("holder-locked", "confirm-calling", "confirm-returned");
        pool.shutdownNow();
    }
}
