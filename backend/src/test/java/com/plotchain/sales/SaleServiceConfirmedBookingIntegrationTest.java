package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.booking.BookingStatus;
import com.plotchain.booking.PlotBooking;
import com.plotchain.booking.PlotBookingRepository;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class SaleServiceConfirmedBookingIntegrationTest {

    @Autowired SaleService saleService;
    @Autowired AssociateRepository associateRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired CompensationPlanVersionRepository compensationPlanVersionRepository;

    private UUID planVersionId;
    private UUID projectId;
    private UUID plotId;
    private UUID associateId;
    private UUID bookingId;
    private UUID saleId;

    @BeforeEach
    void setUp() {
        CompensationPlanVersion planVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "conf-booking", LocalDate.of(2025, 6, 1),
            new BigDecimal("6.00"), new BigDecimal("7.00"), new BigDecimal("11.00"),
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null,
            new BigDecimal("1.00"), new BigDecimal("2000"),
            new BigDecimal("2.00"), new BigDecimal("3000"));
        compensationPlanVersionRepository.saveAndFlush(planVersion);
        planVersionId = planVersion.getId();

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setName("confirmed-booking-associate");
        associate.setUserId("confirmed-booking-associate");
        associate.setEmail("confirmed-booking-associate@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setRankId(UUID.fromString("00000000-0000-0000-0000-000000000201"));
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setPosition("L");
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associateRepository.saveAndFlush(associate);
        associateId = associate.getId();

        Project project = new Project(UUID.randomUUID(), "Confirmed Booking Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "CB-101", PlotType.NORMAL,
            new BigDecimal("3000"), new BigDecimal("500.00"), new BigDecimal("1000000.00"), PlotStatus.BOOKED);
        plotRepository.saveAndFlush(plot);
        plotId = plot.getId();

        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(plotId);
        booking.setAssociateId(associateId);
        booking.setTotalAmount(new BigDecimal("900000.00"));
        booking.setInstallmentCount(3);
        booking.setBookedAt(Instant.now());
        booking.setStatus(BookingStatus.ACTIVE);
        booking.setBuyerName("Jane Buyer");
        plotBookingRepository.saveAndFlush(booking);
        bookingId = booking.getId();
    }

    @AfterEach
    void cleanUp() {
        if (saleId != null) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAllBySourceRef(saleId));
            saleRepository.deleteById(saleId);
        }
        plotBookingRepository.deleteById(bookingId);
        plotRepository.deleteById(plotId);
        projectRepository.deleteById(projectId);
        associateRepository.deleteById(associateId);
        compensationPlanVersionRepository.deleteById(planVersionId);
    }

    @Test
    void recordConfirmedBookingPersistsLinkedSaleSoldPlotAndDirectIncome() {
        SaleResponse r = saleService.recordConfirmedBooking(
            plotBookingRepository.findById(bookingId).orElseThrow(),
            plotRepository.findById(plotId).orElseThrow());
        saleId = r.id();

        Sale sale = saleRepository.findById(saleId).orElseThrow();
        assertThat(sale.getBookingId()).isEqualTo(bookingId);
        assertThat(sale.getAmount()).isEqualByComparingTo("900000.00");
        assertThat(sale.getNote()).isEqualTo("Confirmed from booking " + bookingId);
        assertThat(sale.getLegCredited()).isEqualTo("L");
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.SOLD);

        List<LedgerEntry> entries = ledgerEntryRepository.findAllBySourceRef(saleId);
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).getIncomeType()).isEqualTo(IncomeType.DIRECT);
        // gross = 900000.00 * 6% = 54000
        assertThat(entries.get(0).getGrossAmount()).isEqualByComparingTo("54000");
    }

    @Test
    void voidingTheLinkedSaleReturnsPlotToAvailableAndLeavesBookingUntouched() {
        saleId = saleService.recordConfirmedBooking(
            plotBookingRepository.findById(bookingId).orElseThrow(),
            plotRepository.findById(plotId).orElseThrow()).id();

        saleService.voidSale(saleId, new VoidSaleRequest("test"));

        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        assertThat(ledgerEntryRepository.findAllBySourceRef(saleId))
            .isNotEmpty()
            .allMatch(e -> e.getStatus() == LedgerEntryStatus.REVERSED);
        PlotBooking booking = plotBookingRepository.findById(bookingId).orElseThrow();
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(booking.getSaleId()).isNull();
    }
}
