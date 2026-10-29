package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.SelfPerformanceBonusConfigService;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleService;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SaleServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock CycleService cycleService;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock SaleRepository saleRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;
    @Mock com.plotchain.projects.ProjectRepository projectRepository;

    SaleService saleService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID CYCLE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        saleService = new SaleService(
            plotRepository, associateRepository, cycleService,
            compensationPlanVersionRepository, saleRepository, ledgerEntryRepository,
            selfPerformanceBonusConfigService, projectRepository);
    }

    private Plot plotWithStatus(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private Project projectFixture() {
        return new Project(PROJECT_ID, "Green Valley", "Hyderabad", null, null, Instant.now());
    }

    private Associate associateWithPosition(String position) {
        Associate associate = new Associate();
        associate.setId(ASSOCIATE_ID);
        associate.setPosition(position);
        associate.setUserId("VP00001");
        associate.setName("Jane Associate");
        return associate;
    }

    private Cycle cycleWithId(UUID id) {
        Cycle cycle = new Cycle();
        cycle.setId(id);
        return cycle;
    }

    private CompensationPlanVersion compensationPlanVersion() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.now().minusDays(1),
            new BigDecimal("10.00"), BigDecimal.ZERO, BigDecimal.ZERO,
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.MONTHLY,
            Instant.now(), null,
            new BigDecimal("1.00"), new BigDecimal("2000"), new BigDecimal("2.00"), new BigDecimal("3000"));
    }

    // recordInstallmentPayment: one Sale per confirmed booking payment, amount = that installment.
    private static final UUID BOOKING_ID = UUID.randomUUID();
    private static final UUID INSTALLMENT_ID = UUID.randomUUID();

    private SaleResponse confirm(String totalAmount, Plot plot) {
        return saleService.recordInstallmentPayment(BOOKING_ID, INSTALLMENT_ID, 2, ASSOCIATE_ID, "Jane Buyer",
            "9999999999", new BigDecimal(totalAmount), plot, true);
    }

    private Plot plotForBooking(PlotStatus status, String areaSqft) {
        return new Plot(PLOT_ID, PROJECT_ID, "A-101", PlotType.NORMAL,
            new BigDecimal(areaSqft), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private void stubConfirmedPathDependencies() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(projectFixture()));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
    }

    @Test
    void recordInstallmentPaymentFlipsBookedPlotToSoldAndLinksSaleToBooking() {
        stubConfirmedPathDependencies();
        Plot plot = plotForBooking(PlotStatus.BOOKED, "1200.00");

        // amount comes from the installment (750000), not the plot price (600000)
        SaleResponse response = confirm("750000.00", plot);

        assertThat(plot.getStatus()).isEqualTo(PlotStatus.SOLD);
        verify(plotRepository).save(plot);
        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        Sale saved = captor.getValue();
        assertThat(saved.getBookingId()).isEqualTo(BOOKING_ID);
        assertThat(saved.getEmiInstallmentId()).isEqualTo(INSTALLMENT_ID);
        assertThat(saved.getPlotId()).isEqualTo(PLOT_ID);
        assertThat(saved.getProjectId()).isEqualTo(PROJECT_ID);
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getAmount()).isEqualByComparingTo("750000.00");
        assertThat(saved.getBuyerName()).isEqualTo("Jane Buyer");
        assertThat(saved.getBuyerPhone()).isEqualTo("9999999999");
        assertThat(saved.getNote()).isEqualTo("Payment 2 of booking " + BOOKING_ID);
        assertThat(saved.getStatus()).isEqualTo(SaleStatus.RECORDED);
        assertThat(saved.getLegCredited()).isEqualTo("L");
        assertThat(saved.getCycleId()).isEqualTo(CYCLE_ID);
        assertThat(response.status()).isEqualTo("RECORDED");
        assertThat(response.plotNo()).isEqualTo("A-101");
        // the payment path takes the plot from the caller; it must not lock/read it itself
        verify(plotRepository, never()).findByIdForUpdate(any());
        verify(plotRepository, never()).findById(any());
    }

    @Test
    void partialInstallmentPaymentLeavesPlotBooked() {
        stubConfirmedPathDependencies();
        Plot plot = plotForBooking(PlotStatus.BOOKED, "1200.00");

        saleService.recordInstallmentPayment(BOOKING_ID, INSTALLMENT_ID, 1, ASSOCIATE_ID, "Jane Buyer",
            "9999999999", new BigDecimal("100000.00"), plot, false);

        assertThat(plot.getStatus()).isEqualTo(PlotStatus.BOOKED);
        verify(plotRepository, never()).save(any());
        verify(saleRepository).save(any());
    }

        @Test
    void recordInstallmentPaymentCreditsDirectIncomeForTheInstallmentAmount() {
        stubConfirmedPathDependencies();

        SaleResponse response = confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "1200.00"));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(captor.capture());
        LedgerEntry entry = captor.getValue();
        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.DIRECT);
        assertThat(entry.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(entry.getCycleId()).isEqualTo(CYCLE_ID);
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("60000");
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("3000");
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("2400");
        assertThat(entry.getNetAmount()).isEqualByComparingTo("54600");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getSourceRef()).isEqualTo(response.id());
    }

    @Test
    void recordInstallmentPaymentThrowsAssociateNotFoundForUnknownAssociate() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "1200.00")))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(saleRepository, never()).save(any());
    }

    @Test
    void recordInstallmentPaymentThrowsProjectNotFoundForUnknownProject() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "1200.00")))
            .isInstanceOf(ProjectNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(saleRepository, never()).save(any());
    }

    @Test
    void recordInstallmentPaymentCreditsSelfPerformanceBonusForBookedPlotArea() {
        stubConfirmedPathDependencies();
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        SaleResponse response = confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "3000"));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, times(2)).save(captor.capture());
        LedgerEntry spb = captor.getAllValues().get(1);
        assertThat(spb.getIncomeType()).isEqualTo(IncomeType.SELF_PERFORMANCE);
        // gross = 600000.00 * 2% = 12000
        assertThat(spb.getGrossAmount()).isEqualByComparingTo("12000");
        assertThat(spb.getSourceRef()).isEqualTo(response.id());
    }

    @Test
    void recordInstallmentPaymentThrowsWhenCompensationPlanMissing() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(projectFixture()));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "1200.00")))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("compensation_plan_version");

        verify(ledgerEntryRepository, never()).save(any());
    }

    // Sales unit 4 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 1-2): guard-only tests. The happy-path reversal (steps 3-6) is
    // Sales unit 5's job -- voidSaleReachesThePlaceholderWhenGuardsPass below only proves the
    // guards let a RECORDED sale through, not that anything gets reversed.
    // --- Self-Performance Bonus tiers and KYC gating, via the booking-payment path ---

    private List<LedgerEntry> savedLedgerEntries(int times) {
        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, times(times)).save(captor.capture());
        return captor.getAllValues();
    }

    private LedgerEntry selfPerformance(List<LedgerEntry> entries) {
        return entries.stream().filter(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE).findFirst().orElseThrow();
    }

    @Test
    void paymentCreditsSelfPerformanceBonusAtTier1WhenAreaMeetsTheLowerThreshold() {
        stubConfirmedPathDependencies();
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "2000"));

        // gross = 600000.00 * 1% = 6000
        assertThat(selfPerformance(savedLedgerEntries(2)).getGrossAmount()).isEqualByComparingTo("6000");
    }

    @Test
    void paymentCreditsSelfPerformanceBonusAtTier2WhenAreaMeetsTheHigherThreshold() {
        stubConfirmedPathDependencies();
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "3000"));

        assertThat(selfPerformance(savedLedgerEntries(2)).getGrossAmount()).isEqualByComparingTo("12000");
    }

    @Test
    void paymentWritesNoSelfPerformanceEntryBelowTheLowerThreshold() {
        stubConfirmedPathDependencies();
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "1999"));

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE));
    }

    @Test
    void paymentWritesNoSelfPerformanceEntryWhenTheConfigIsDisabled() {
        stubConfirmedPathDependencies();
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(false);

        confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "3000"));

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE));
    }

    @Test
    void paymentCreditsSelfPerformanceBonusAsCarriedForwardWhenAssociateKycIsNotVerified() {
        stubConfirmedPathDependencies();
        Associate unverified = associateWithPosition("L");
        unverified.setKycStatus(KycStatus.PENDING);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(unverified));
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        confirm("600000.00", plotForBooking(PlotStatus.BOOKED, "2000"));

        assertThat(selfPerformance(savedLedgerEntries(2)).getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    // compensation-plan-reference.md's real published rates (direct 6%, tds 2%, admin-without-pan 15%)
    // so the expected amounts match the doc's own Round 1 worked example exactly.
    private CompensationPlanVersion referenceCompensationPlanVersion() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "reference", LocalDate.now().minusDays(1),
            new BigDecimal("6.00"), BigDecimal.ZERO, BigDecimal.ZERO,
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.MONTHLY,
            Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }

    @Test
    void paymentSavesADirectIncomeLedgerEntryMatchingRound1DocFixture() {
        stubConfirmedPathDependencies();
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(referenceCompensationPlanVersion()));

        confirm("1000000.00", plotForBooking(PlotStatus.BOOKED, "1200.00"));

        LedgerEntry entry = savedLedgerEntries(1).get(0);
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("60000");   // 10,00,000 * 6%
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("1200");   // 60,000 * 2%
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("9000"); // 60,000 * 15%
        assertThat(entry.getNetAmount()).isEqualByComparingTo("49800");
    }

    @Test
    void voidSaleThrowsSaleNotFoundExceptionWhenTheSaleDoesNotExist() {
        UUID saleId = UUID.randomUUID();
        when(saleRepository.findById(saleId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(SaleNotFoundException.class);

        verify(saleRepository, never()).save(any());
        verify(plotRepository, never()).save(any());
        verify(ledgerEntryRepository, never()).save(any());
    }

    @Test
    void voidSaleThrowsSaleAlreadyVoidedExceptionWhenTheSaleIsAlreadyVoided() {
        UUID saleId = UUID.randomUUID();
        Sale voidedSale = new Sale();
        voidedSale.setId(saleId);
        voidedSale.setStatus(SaleStatus.VOIDED);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(voidedSale));

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(SaleAlreadyVoidedException.class);

        verify(saleRepository, never()).save(any());
        verify(plotRepository, never()).save(any());
        verify(ledgerEntryRepository, never()).save(any());
    }

    // Sales unit 5 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 3-6): happy-path reversal tests.
    private Sale recordedSale(UUID saleId, UUID plotId) {
        Sale sale = new Sale();
        sale.setId(saleId);
        sale.setPlotId(plotId);
        sale.setProjectId(PROJECT_ID);
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setNote("Sold to Jane Buyer");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(CYCLE_ID);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());
        return sale;
    }

    private LedgerEntry pendingLedgerEntry(UUID sourceRef) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setIncomeType(IncomeType.DIRECT);
        entry.setAssociateId(ASSOCIATE_ID);
        entry.setCycleId(CYCLE_ID);
        entry.setGrossAmount(new BigDecimal("60000"));
        entry.setTdsDeduction(new BigDecimal("3000"));
        entry.setAdminDeduction(new BigDecimal("2400"));
        entry.setNetAmount(new BigDecimal("54600"));
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setSourceRef(sourceRef);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    private void stubVoidHappyPath(Sale sale, LedgerEntry ledgerEntry) {
        when(saleRepository.findById(sale.getId())).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(sale.getPlotId())).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(sale.getId())).thenReturn(List.of(ledgerEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(projectFixture()));
    }

    @Test
    void voidSaleFlipsSaleToVoidedAndStampsTheVoidReason() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(SaleStatus.VOIDED);
        assertThat(captor.getValue().getVoidReason()).isEqualTo("Buyer backed out");
    }

    @Test
    void voidSaleFlipsThePlotBackToAvailable() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.AVAILABLE);
    }

    @Test
    void voidSaleReversesTheLinkedLedgerEntry() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        verify(ledgerEntryRepository).findAllBySourceRef(saleId);
        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.REVERSED);
        assertThat(captor.getValue().getSourceRef()).isEqualTo(saleId);
    }

    @Test
    void voidSaleReturnsAFullyPopulatedSaleResponseReflectingTheReversal() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        SaleResponse response = saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        assertThat(response.id()).isEqualTo(saleId);
        assertThat(response.plotId()).isEqualTo(PLOT_ID);
        assertThat(response.status()).isEqualTo("VOIDED");
        assertThat(response.voidReason()).isEqualTo("Buyer backed out");
        assertThat(response.note()).isEqualTo("Sold to Jane Buyer");
        assertThat(response.projectName()).isEqualTo("Green Valley");
    }

    // Mandatory-fields change: plotId is optional, so a voided sale may have no Plot to flip
    // back to AVAILABLE. voidSale must skip that step entirely rather than treating a null
    // plot_id as the missing-Plot data-integrity case below.
    @Test
    void voidSaleSkipsThePlotLookupAndFlipWhenTheSaleHasNoLinkedPlot() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, null);
        // Not stubVoidHappyPath: that helper stubs plotRepository.findById(sale.getPlotId()),
        // which would be an unused (null-argument) stub here under MockitoExtension's strict
        // stubbing, since a plotless sale never calls it.
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(saleId)).thenReturn(List.of(pendingLedgerEntry(saleId)));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(projectFixture()));

        SaleResponse response = saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        verify(plotRepository, never()).findById(any());
        verify(plotRepository, never()).save(any());
        assertThat(response.plotId()).isNull();
        assertThat(response.status()).isEqualTo("VOIDED");
    }

    @Test
    void voidSaleResolvesAssociateDisplayFieldsViaANewLookup() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        SaleResponse response = saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Associate");
    }

    @Test
    void voidSaleReversesEveryLedgerEntrySharingTheSaleAsSourceRef() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        LedgerEntry directEntry = pendingLedgerEntry(saleId);
        LedgerEntry selfPerformanceEntry = pendingLedgerEntry(saleId);
        selfPerformanceEntry.setId(UUID.randomUUID());
        selfPerformanceEntry.setIncomeType(IncomeType.SELF_PERFORMANCE);

        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(sale.getPlotId())).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(saleId)).thenReturn(List.of(directEntry, selfPerformanceEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).allMatch(e -> e.getStatus() == LedgerEntryStatus.REVERSED);
        assertThat(captor.getAllValues()).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(directEntry.getId(), selfPerformanceEntry.getId());
    }

    @Test
    void voidSaleThrowsIllegalStateExceptionWhenThePlotRowIsMissing() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(IllegalStateException.class);

        verify(ledgerEntryRepository, never()).save(any());
    }

    @Test
    void voidSaleThrowsIllegalStateExceptionWhenTheLedgerEntryRowIsMissing() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(saleId)).thenReturn(List.of());

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(IllegalStateException.class);

        verify(ledgerEntryRepository, never()).save(any());
    }

    // Sales unit 6 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Admin register -- GET /api/admin/sales"): list() delegation and date-range conversion.
    @Test
    void listReturnsAPageMappedToSaleResponses() {
        Sale sale = recordedSale(UUID.randomUUID(), PLOT_ID);
        when(saleRepository.searchRegister(
            eq(ASSOCIATE_ID), eq(SaleStatus.RECORDED), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(java.util.List.of(sale), PageRequest.of(0, 20), 1));

        AdminSalePageResponse response = saleService.list(ASSOCIATE_ID, SaleStatus.RECORDED, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.sales()).hasSize(1);
        assertThat(response.sales().get(0).id()).isEqualTo(sale.getId());
        assertThat(response.sales().get(0).status()).isEqualTo("RECORDED");
    }

    @Test
    void listConvertsRecordedDateRangeToAnExclusiveUpperBoundInstant() {
        when(saleRepository.searchRegister(isNull(), isNull(), any(), any(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(java.util.List.of()));

        saleService.list(null, null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 0, 20);

        ArgumentCaptor<Instant> fromCaptor = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> toCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(saleRepository).searchRegister(isNull(), isNull(), fromCaptor.capture(), toCaptor.capture(), any());
        assertThat(fromCaptor.getValue()).isEqualTo(Instant.parse("2026-01-01T00:00:00Z"));
        // Exclusive upper bound: the day AFTER recordedTo, so Jan 31 itself is included.
        assertThat(toCaptor.getValue()).isEqualTo(Instant.parse("2026-02-01T00:00:00Z"));
    }

    @Test
    void listPassesNullFiltersThroughWhenNoneAreProvided() {
        when(saleRepository.searchRegister(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(java.util.List.of()));

        AdminSalePageResponse response = saleService.list(null, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        verify(saleRepository).searchRegister(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20)));
    }

    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): getMySales() resolves the caller's
    // self-plus-downline ID set first, then filters Sale rows by it.
    @Test
    void getMySalesResolvesSelfAndDownlineIdsThenFiltersSalesByThem() {
        List<UUID> selfAndDownlineIds = List.of(ASSOCIATE_ID, UUID.randomUUID());
        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(selfAndDownlineIds);
        Sale sale = recordedSale(UUID.randomUUID(), PLOT_ID);
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            eq(selfAndDownlineIds), any(), any(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(sale), PageRequest.of(0, 20), 1));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, null, null, 0, 20);

        verify(associateRepository).findSelfAndDownline(ASSOCIATE_ID);
        verify(saleRepository).findByAssociateIdInOrderByRecordedAtDesc(
            eq(selfAndDownlineIds), any(), any(), eq(PageRequest.of(0, 20)));
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.sales()).hasSize(1);
        assertThat(response.sales().get(0).id()).isEqualTo(sale.getId());
        assertThat(response.sales().get(0).status()).isEqualTo("RECORDED");
    }

    @Test
    void getMySalesReturnsAnEmptyPageWhenTheCallerHasNoSalesInTheirSubtree() {
        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            eq(List.of(ASSOCIATE_ID)), any(), any(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        assertThat(response.sales()).isEmpty();
    }

    @Test
    void getMySalesPopulatesPlotNoAndProjectNameFromABatchLookupNotPerRowQueries() {
        UUID plotId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setProjectId(projectId);
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(CYCLE_ID);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());

        com.plotchain.projects.Plot plot = new com.plotchain.projects.Plot(
            plotId, projectId, "VG2-118", com.plotchain.projects.PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
            com.plotchain.projects.PlotStatus.SOLD);
        com.plotchain.projects.Project project = new com.plotchain.projects.Project(
            projectId, "Viraj Greens Ph II", "Patna", null, null, Instant.now());

        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(eq(List.of(ASSOCIATE_ID)), any(), any(), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sale)));
        when(plotRepository.findAllById(List.of(plotId))).thenReturn(List.of(plot));
        when(projectRepository.findAllById(List.of(projectId))).thenReturn(List.of(project));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, null, null, 0, 20);

        assertThat(response.sales()).hasSize(1);
        assertThat(response.sales().get(0).plotNo()).isEqualTo("VG2-118");
        assertThat(response.sales().get(0).projectName()).isEqualTo("Viraj Greens Ph II");
    }

    @Test
    void getMySalesPopulatesAssociateUserIdAndNameFromABatchLookupNotPerRowQueries() {
        UUID plotId = UUID.randomUUID();
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(CYCLE_ID);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());

        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(eq(List.of(ASSOCIATE_ID)), any(), any(), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sale)));
        when(plotRepository.findAllById(List.of(plotId))).thenReturn(List.of());
        when(associateRepository.findAllById(List.of(ASSOCIATE_ID))).thenReturn(List.of(associateWithPosition("L")));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, null, null, 0, 20);

        assertThat(response.sales().get(0).associateUserId()).isEqualTo("VP00001");
        assertThat(response.sales().get(0).associateName()).isEqualTo("Jane Associate");
    }

    @Test
    void getMySalesLeavesPlotNoNullWhenThePlotCannotBeFound() {
        UUID plotId = UUID.randomUUID();
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setProjectId(PROJECT_ID);
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(CYCLE_ID);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());

        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(eq(List.of(ASSOCIATE_ID)), any(), any(), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sale)));
        when(plotRepository.findAllById(List.of(plotId))).thenReturn(List.of());
        when(projectRepository.findAllById(List.of(PROJECT_ID))).thenReturn(List.of(projectFixture()));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, null, null, 0, 20);

        assertThat(response.sales().get(0).plotNo()).isNull();
    }

    // Mandatory-fields change: projectName now resolves from Sale.projectId directly, not by
    // joining through Plot -- it must stay populated even when the linked Plot can't be found
    // (or there's no linked Plot at all), unlike plotNo above.
    @Test
    void getMySalesResolvesProjectNameFromSaleProjectIdIndependentlyOfThePlotLookup() {
        UUID plotId = UUID.randomUUID();
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setProjectId(PROJECT_ID);
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(CYCLE_ID);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());

        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(eq(List.of(ASSOCIATE_ID)), any(), any(), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sale)));
        // Plot lookup comes back empty (as if the Plot were deleted) -- projectName must still resolve.
        when(plotRepository.findAllById(List.of(plotId))).thenReturn(List.of());
        when(projectRepository.findAllById(List.of(PROJECT_ID))).thenReturn(List.of(projectFixture()));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, null, null, 0, 20);

        assertThat(response.sales().get(0).plotNo()).isNull();
        assertThat(response.sales().get(0).projectName()).isEqualTo("Green Valley");
    }
}
