package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
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

    SaleService saleService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID CYCLE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        saleService = new SaleService(
            plotRepository, associateRepository, cycleService,
            compensationPlanVersionRepository, saleRepository, ledgerEntryRepository);
    }

    private Plot plotWithStatus(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private CreateSaleRequest requestFor(UUID plotId, UUID associateId) {
        return new CreateSaleRequest(plotId, associateId, "Jane Buyer", "9999999999", null);
    }

    private Associate associateWithPosition(String position) {
        Associate associate = new Associate();
        associate.setId(ASSOCIATE_ID);
        associate.setPosition(position);
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
            Instant.now(), null);
    }

    private void stubHappyPathGuardsAndDependencies() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
    }

    // Code-review finding (pre-merge review of this branch): recordSale read Plot via a plain
    // unlocked findById before checking AVAILABLE and flipping to SOLD, so two concurrent
    // POST /api/admin/sales requests against the same plot could both pass the guard before
    // either committed, double-selling the plot. Fix mirrors CycleRepository.findByIdForUpdate
    // (cycle-management unit 3): recordSale must acquire the row lock via findByIdForUpdate,
    // never the unlocked findById, as its first statement.
    @Test
    void recordSaleAcquiresTheRowLockOnThePlotViaFindByIdForUpdateNotFindById() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(plotRepository).findByIdForUpdate(PLOT_ID);
        verify(plotRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsPlotNotFoundExceptionWhenThePlotDoesNotExist() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsPlotNotAvailableExceptionWhenThePlotIsNotAvailable() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsAssociateNotFoundExceptionWhenTheAssociateDoesNotExist() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void recordSaleFlipsThePlotToSold() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.SOLD);
    }

    @Test
    void recordSaleStampsTheCurrentCycleOntoTheSale() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(cycleService).getOrOpenCurrent();
        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        assertThat(captor.getValue().getCycleId()).isEqualTo(CYCLE_ID);
    }

    @Test
    void recordSaleSavesASaleWithAmountAndLegSnapshottedAtRecordTime() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        Sale saved = captor.getValue();
        assertThat(saved.getPlotId()).isEqualTo(PLOT_ID);
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getAmount()).isEqualByComparingTo("600000.00");
        assertThat(saved.getLegCredited()).isEqualTo("L");
        assertThat(saved.getStatus()).isEqualTo(SaleStatus.RECORDED);
        assertThat(saved.getRecordedAt()).isNotNull();
        assertThat(saved.getBuyerName()).isEqualTo("Jane Buyer");
        assertThat(saved.getBuyerPhone()).isEqualTo("9999999999");
    }

    @Test
    void recordSaleSavesADirectIncomeLedgerEntryWithCorrectMath() {
        stubHappyPathGuardsAndDependencies();

        SaleResponse response = saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(captor.capture());
        LedgerEntry entry = captor.getValue();
        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.DIRECT);
        assertThat(entry.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(entry.getCycleId()).isEqualTo(CYCLE_ID);
        // gross = 600000.00 * (10.00 / 100) = 60000
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("60000");
        // tds = 60000 * (5.00 / 100) = 3000
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("3000");
        // admin = 60000 * (4.00 / 100) = 2400 -- always the without-PAN tier (Decision 4)
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("2400");
        // net = 60000 - 3000 - 2400 = 54600
        assertThat(entry.getNetAmount()).isEqualByComparingTo("54600");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getSourceRef()).isEqualTo(response.id());
        assertThat(entry.getCreatedAt()).isNotNull();
    }

    @Test
    void recordSaleReturnsAFullyPopulatedSaleResponse() {
        stubHappyPathGuardsAndDependencies();

        SaleResponse response = saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.id()).isNotNull();
        assertThat(response.plotId()).isEqualTo(PLOT_ID);
        assertThat(response.associateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(response.buyerName()).isEqualTo("Jane Buyer");
        assertThat(response.buyerPhone()).isEqualTo("9999999999");
        assertThat(response.buyerEmail()).isNull();
        assertThat(response.amount()).isEqualByComparingTo("600000.00");
        assertThat(response.cycleId()).isEqualTo(CYCLE_ID);
        assertThat(response.legCredited()).isEqualTo("L");
        assertThat(response.status()).isEqualTo("RECORDED");
        assertThat(response.voidReason()).isNull();
        assertThat(response.recordedAt()).isNotNull();
    }

    @Test
    void recordSaleThrowsIllegalStateExceptionWhenNoCompensationPlanVersionIsConfigured() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(IllegalStateException.class);

        verify(ledgerEntryRepository, never()).save(any());
    }

    // Sales unit 4 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 1-2): guard-only tests. The happy-path reversal (steps 3-6) is
    // Sales unit 5's job -- voidSaleReachesThePlaceholderWhenGuardsPass below only proves the
    // guards let a RECORDED sale through, not that anything gets reversed.
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
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
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
        when(ledgerEntryRepository.findBySourceRef(sale.getId())).thenReturn(Optional.of(ledgerEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
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

        verify(ledgerEntryRepository).findBySourceRef(saleId);
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
        when(ledgerEntryRepository.findBySourceRef(saleId)).thenReturn(Optional.empty());

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
            eq(selfAndDownlineIds), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(sale), PageRequest.of(0, 20), 1));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

        verify(associateRepository).findSelfAndDownline(ASSOCIATE_ID);
        verify(saleRepository).findByAssociateIdInOrderByRecordedAtDesc(
            selfAndDownlineIds, PageRequest.of(0, 20));
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
            eq(List.of(ASSOCIATE_ID)), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        assertThat(response.sales()).isEmpty();
    }
}
