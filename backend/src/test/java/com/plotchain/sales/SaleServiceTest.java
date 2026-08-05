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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
    }

    @Test
    void recordSaleThrowsPlotNotFoundExceptionWhenThePlotDoesNotExist() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsPlotNotAvailableExceptionWhenThePlotIsNotAvailable() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsAssociateNotFoundExceptionWhenTheAssociateDoesNotExist() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void recordSaleReachesThePlaceholderWhenAllGuardsPass() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(new Associate()));

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(UnsupportedOperationException.class);

        verify(plotRepository, never()).save(any());
    }
}
