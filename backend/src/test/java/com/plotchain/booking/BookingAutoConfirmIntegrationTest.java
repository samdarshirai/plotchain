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

// Real-DB (H2 via Flyway) proof for plot-booking unit 5: AUTO_THRESHOLD confirms inside recordPayment.
// Harness mirrors BookingConfirmIntegrationTest (committed rows, manual cleanup, circular sale<->booking
// FKs nulled first) plus save/restore of the global booking_emi_config singleton.
@SpringBootTest
@ActiveProfiles("test")
class BookingAutoConfirmIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    // Pass-through spy (reset by Spring after each test) so one test can make the CONFIRMED event write
    // fail AFTER the PAID write, the sale insert and the plot flip. Boot 3.3.4: @SpyBean.
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
        return bookingService.createBooking(new CreateBookingRequest(plotId, associateId, "Jane Buyer", null));
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

    // ---- confirm / not confirm -------------------------------------------------------------------

    @Test
    void payCrossingTheThresholdConfirmsInTheSameCallWithLinkedSaleSoldPlotAndBothEvents() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();

        BookingResponse first = payInstallment(b, 1);                // 25%: below
        assertThat(first.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(plotStatus()).isEqualTo("BOOKED");

        BookingResponse second = payInstallment(b, 2);               // 50%: at threshold exactly

        assertThat(second.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(second.paidAmount()).isEqualByComparingTo("300000.00");
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED' AND actor_id = ?",
            b.id(), associateId)).isEqualTo(1);
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("CONFIRMED_AT")).isNotNull();
        assertThat(row.get("SALE_ID")).isNotNull();
    }

    @Test
    void payBelowTheThresholdDoesNotConfirm() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();

        BookingResponse after = payInstallment(b, 1);

        assertThat(after.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isZero();
    }

    @Test
    void underManualPayingEveryInstallmentNeverAutoConfirms() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();

        for (int n = 1; n <= 4; n++) payInstallment(b, n);

        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(4);
        // admin can still confirm manually afterwards (unit 4), proving MANUAL left it ACTIVE, not stuck
        assertThat(bookingService.confirmBooking(b.id(), associateId).status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    void oneHundredPercentThresholdConfirmsOnlyOnTheLastPaymentEvenWithRoundingInTheLastInstallment() {
        setConfig(true, 7, "AUTO_THRESHOLD", 100);       // 600000/7 does not divide: last installment absorbs the remainder
        BookingResponse b = seedBooking();

        for (int n = 1; n < 7; n++) {
            assertThat(payInstallment(b, n).status()).as("after installment " + n).isEqualTo(BookingStatus.ACTIVE);
        }
        BookingResponse last = payInstallment(b, 7);

        assertThat(last.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(last.paidAmount()).isEqualByComparingTo("600000.00");
    }

    @Test
    void onePercentThresholdConfirmsOnTheFirstPayment() {
        setConfig(true, 4, "AUTO_THRESHOLD", 1);
        BookingResponse b = seedBooking();

        assertThat(payInstallment(b, 1).status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
    }

    // ---- config is read at pay time, not snapshotted --------------------------------------------

    @Test
    void theRuleAndThresholdInForceAtPayTimeApplyNotThoseAtBookingCreation() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();                 // created under MANUAL
        payInstallment(b, 1);
        payInstallment(b, 2);                              // 50% paid, still ACTIVE under MANUAL
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");

        setConfig(true, 4, "AUTO_THRESHOLD", 50);          // switching is NOT retroactive...
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");

        BookingResponse after = payInstallment(b, 3);      // ...the next pay evaluates the current config: 75% >= 50%

        assertThat(after.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
    }

    @Test
    void raisingTheThresholdBetweenPaymentsDefersTheConfirm() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        setConfig(true, 4, "AUTO_THRESHOLD", 100);         // raised before the pay that would have hit 50%

        assertThat(payInstallment(b, 2).status()).isEqualTo(BookingStatus.ACTIVE);
        payInstallment(b, 3);
        assertThat(payInstallment(b, 4).status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    // ---- atomicity ------------------------------------------------------------------------------

    // The CONFIRMED event write fails AFTER the installment is PAID, the PAID event is written, the sale +
    // ledger rows are inserted and the plot is flipped to SOLD, so only the surrounding transaction can
    // undo all of it.
    @Test
    void aFailureInTheConfirmStepRollsBackThePaymentTheSaleAndThePlotFlip() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);                              // committed, below threshold
        doThrow(new IllegalStateException("simulated confirm failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.CONFIRMED));

        assertThatThrownBy(() -> payInstallment(b, 2))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        // fresh JDBC reads (no persistence context involved)
        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject(
            "SELECT payment_ref FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isNull();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id()))
            .isEqualTo(1);                                  // only installment 1's
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id()))
            .isZero();
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM ledger_entry WHERE associate_id = ?", associateId)).isZero();
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("STATUS")).isEqualTo("ACTIVE");
        assertThat(row.get("CONFIRMED_AT")).isNull();
        assertThat(row.get("SALE_ID")).isNull();
    }

    // Decision 1 (this plan): plot drift makes the auto-confirm fail with 409 and the pay rolls back too.
    // Unlike unit 4's drift test this one writes the installment and PAID event BEFORE the failure, so it
    // also proves rollback.
    @Test
    void autoConfirmOnADriftedPlotIs409AndTheWholePayRollsBack() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);   // drift

        assertThatThrownBy(() -> payInstallment(b, 2)).isInstanceOf(PlotNotAvailableException.class);

        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isEqualTo("PENDING");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(1);
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
        assertThat(plotStatus()).isEqualTo("AVAILABLE");   // untouched by the failed pay
        // a pay that does NOT cross the threshold still works on a drifted plot (documented consequence)
        setConfig(true, 4, "AUTO_THRESHOLD", 100);
        assertThat(payInstallment(b, 2).status()).isEqualTo(BookingStatus.ACTIVE);
    }

    // ---- already confirmed ----------------------------------------------------------------------

    @Test
    void payingAnAlreadyConfirmedBookingIs409AndNeverConfirmsTwice() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        payInstallment(b, 2);                              // auto-confirmed here

        assertThatThrownBy(() -> payInstallment(b, 3)).isInstanceOf(BookingNotActiveException.class);

        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 3",
            String.class, b.id())).isEqualTo("PENDING");
    }
}
