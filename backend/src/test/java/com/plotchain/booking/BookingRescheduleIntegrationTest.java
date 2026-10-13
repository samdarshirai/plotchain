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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Real-DB (H2 via Flyway) proof for BookingService.rescheduleBooking (reference-gap U4): persistence,
// V46 CHECK through the real insert path, report effects, and the booking-lock race with recordPayment.
// Fixture: LegacyScheduleSeed gives 4 equal PENDING rows (150000.00 each, total 600000.00).
@SpringBootTest
@ActiveProfiles("test")
class BookingRescheduleIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired OverdueReportService overdueReportService;
    @Autowired LastEmiReportService lastEmiReportService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID projectId;
    private final List<UUID> associateIds = new ArrayList<>();
    private final List<UUID> plotIds = new ArrayList<>();
    private int plotSeq = 0;
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

    // ---- fixtures (same shape as BookingTransferIntegrationTest) ---------------------------------

    private UUID seedPlot() {
        return new TransactionTemplate(transactionManager).execute(s -> {
            if (projectId == null) {
                Project p = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
                projectRepository.saveAndFlush(p);
                projectId = p.getId();
            }
            Plot plot = new Plot(UUID.randomUUID(), projectId, "R-" + (++plotSeq), PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            plotIds.add(plot.getId());
            return plot.getId();
        });
    }

    private UUID seedAssociate() {
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
            associateRepository.saveAndFlush(a);
            associateIds.add(id);
            return id;
        });
    }

    private UUID admin;

    private BookingResponse seedBooking() {
        admin = seedAssociate();
        return LegacyScheduleSeed.book(bookingService, jdbc, seedPlot(), admin, "Jane Buyer");
    }

    private static LocalDate utcToday() { return LocalDate.now(ZoneOffset.UTC); }

    private RescheduleRequest req(int count, LocalDate firstDue) { return new RescheduleRequest(count, firstDue); }

    private void enter(UUID bookingId, int number) {
        bookingService.recordPayment(bookingId, number, new RecordPaymentRequest(
            new BigDecimal("150000.00"), "UTR-" + number, PaymentMode.CASH, null), admin);
    }

    private int count(String sql, Object... args) { return jdbc.queryForObject(sql, Integer.class, args); }

    // ---- persistence ------------------------------------------------------------------------------

    @Test
    void persistsVoidAndNewRowsAndExactlyOneRescheduledEvent() {
        BookingResponse b = seedBooking();
        enter(b.id(), 2);

        bookingService.rescheduleBooking(b.id(), req(2, utcToday().plusDays(30)), admin);

        assertThat(jdbc.queryForList("SELECT installment_number FROM emi_installment WHERE booking_id = ? AND status = 'VOID' ORDER BY installment_number",
            Integer.class, b.id())).containsExactly(1, 3, 4);
        assertThat(jdbc.queryForList("SELECT installment_number FROM emi_installment WHERE booking_id = ? AND status = 'PENDING' ORDER BY installment_number",
            Integer.class, b.id())).containsExactly(5, 6);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'ENTERED'", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'RESCHEDULED'", b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT installment_count FROM plot_booking WHERE id = ?", Integer.class, b.id())).isEqualTo(3);
    }

    @Test
    void sumOfNonVoidRowsEqualsTotal() {
        BookingResponse b = seedBooking();
        enter(b.id(), 2);

        bookingService.rescheduleBooking(b.id(), req(7, utcToday()), admin);

        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM emi_installment WHERE booking_id = ? AND status <> 'VOID'",
            BigDecimal.class, b.id())).isEqualByComparingTo("600000.00");
    }

    @Test
    void autoThresholdBookingIsNotConfirmedByReschedule() {
        jdbc.update("UPDATE booking_emi_config SET confirm_rule = 'AUTO_THRESHOLD', confirm_threshold_percent = 100");
        BookingResponse b = seedBooking();

        BookingResponse after = bookingService.rescheduleBooking(b.id(), req(3, utcToday()), admin);

        assertThat(after.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, b.id())).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, b.plotId())).isEqualTo("BOOKED");
    }

    // ---- reports ----------------------------------------------------------------------------------

    @Test
    void overdueReportDropsVoidedOverdueRows() {
        BookingResponse b = seedBooking();
        jdbc.update("UPDATE emi_installment SET due_date = ? WHERE booking_id = ? AND installment_number = 1",
            java.sql.Date.valueOf(utcToday().minusDays(10)), b.id());
        assertThat(overdueReportService.getOverdueReport(0, 1000).rows()).extracting(OverdueReportRow::bookingId).contains(b.id());

        bookingService.rescheduleBooking(b.id(), req(3, utcToday()), admin);

        assertThat(overdueReportService.getOverdueReport(0, 1000).rows()).extracting(OverdueReportRow::bookingId).doesNotContain(b.id());
    }

    @Test
    void lastEmiReportUsesNewLastDueDate() {
        BookingResponse b = seedBooking();
        LocalDate oldLast = jdbc.queryForObject("SELECT MAX(due_date) FROM emi_installment WHERE booking_id = ?", LocalDate.class, b.id());
        LocalDate newFirst = oldLast.plusMonths(6);

        bookingService.rescheduleBooking(b.id(), req(2, newFirst), admin);

        LocalDate newLast = newFirst.plusMonths(1);
        assertThat(lastEmiReportService.report(newLast, newLast, projectId)).extracting(LastEmiRow::bookingId).contains(b.id());
        assertThat(lastEmiReportService.report(oldLast, oldLast, projectId)).extracting(LastEmiRow::bookingId).doesNotContain(b.id());
    }

    // ---- payments after reschedule ----------------------------------------------------------------

    @Test
    void enteringAVoidedInstalmentAfterRescheduleIs409() {
        BookingResponse b = seedBooking();
        bookingService.rescheduleBooking(b.id(), req(2, utcToday()), admin);

        assertThatThrownBy(() -> enter(b.id(), 3)).isInstanceOf(InstallmentNotPayableException.class);
    }

    @Test
    void rescheduleThenPayNewRow() {
        BookingResponse b = seedBooking();
        BookingResponse after = bookingService.rescheduleBooking(b.id(), req(2, utcToday()), admin);
        BigDecimal amt = after.installments().stream().filter(i -> i.installmentNumber() == 5).findFirst().orElseThrow().amount();

        bookingService.recordPayment(b.id(), 5, new RecordPaymentRequest(amt, "UTR-NEW", PaymentMode.BANK_TRANSFER, null), admin);

        assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 5",
            String.class, b.id())).isEqualTo("ENTERED");
    }

    // ---- concurrency ------------------------------------------------------------------------------

    @Test
    void concurrentRescheduleAndPaySerialise() throws Exception {
        BookingResponse b = seedBooking();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        try {
            Future<?> pay = pool.submit(() -> {
                go.await();
                try { enter(b.id(), 3); } catch (InstallmentNotPayableException expectedWhenRescheduleWon) { /* loser */ }
                return null;
            });
            Future<?> resched = pool.submit(() -> {
                go.await();
                bookingService.rescheduleBooking(b.id(), req(2, utcToday()), admin);
                return null;
            });
            go.countDown();
            pay.get(30, TimeUnit.SECONDS);
            resched.get(30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        assertThat(jdbc.queryForObject("SELECT SUM(amount) FROM emi_installment WHERE booking_id = ? AND status <> 'VOID'",
            BigDecimal.class, b.id())).isEqualByComparingTo("600000.00");
        // a voided row never carries a recorded payment
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID' AND payment_ref IS NOT NULL", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'RESCHEDULED'", b.id())).isEqualTo(1);
    }
}
