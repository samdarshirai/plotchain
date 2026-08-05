package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SaleServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;

    SaleService saleService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        saleService = new SaleService(plotRepository, associateRepository);
    }

    private Plot plotWithStatus(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private CreateSaleRequest requestFor(UUID plotId, UUID associateId) {
        return new CreateSaleRequest(plotId, associateId, "Jane Buyer", "9999999999", null);
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
