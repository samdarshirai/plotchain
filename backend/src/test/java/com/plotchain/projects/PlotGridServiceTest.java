package com.plotchain.projects;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlotGridServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock ProjectRepository projectRepository;

    PlotGridService service;

    private static final UUID PROJECT_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new PlotGridService(plotRepository, projectRepository);
    }

    private Plot plot(String plotNo, PlotStatus status) {
        return new Plot(UUID.randomUUID(), PROJECT_ID, plotNo, PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    @Test
    void unknownProjectThrowsProjectNotFoundAndNeverReadsPlots() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.grid(PROJECT_ID)).isInstanceOf(ProjectNotFoundException.class);
        verify(plotRepository, never()).findByProjectId(PROJECT_ID);
    }

    @Test
    void mapsExactlyTheSixGridFields() {
        Plot p = plot("A-1", PlotStatus.BOOKED);
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(p));

        PlotGridResponse row = service.grid(PROJECT_ID).get(0);

        assertThat(row).isEqualTo(new PlotGridResponse(p.getId(), "A-1", PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("600000.00"), PlotStatus.BOOKED));
    }

    @Test
    void emptyProjectReturnsAnEmptyList() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of());

        assertThat(service.grid(PROJECT_ID)).isEmpty();
    }

    @Test
    void numericLookingPlotNumbersSortNumericallyNotLexically() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
            plot("10", PlotStatus.AVAILABLE), plot("2", PlotStatus.AVAILABLE), plot("1", PlotStatus.AVAILABLE)));

        assertThat(service.grid(PROJECT_ID)).extracting(PlotGridResponse::plotNo).containsExactly("1", "2", "10");
    }

    @Test
    void prefixedPlotNumbersSortNaturallyWithDigitsBeforeTextAndCaseInsensitive() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
            plot("B-1", PlotStatus.AVAILABLE), plot("A-10", PlotStatus.AVAILABLE), plot("A-2", PlotStatus.AVAILABLE),
            plot("a-3", PlotStatus.AVAILABLE), plot("7", PlotStatus.AVAILABLE), plot("A-02", PlotStatus.AVAILABLE)));

        assertThat(service.grid(PROJECT_ID)).extracting(PlotGridResponse::plotNo)
            .containsExactly("7", "A-02", "A-2", "a-3", "A-10", "B-1");
    }

    @Test
    void naturalComparatorIsAntisymmetricAndPrefixSortsFirst() {
        assertThat(PlotGridService.compareNatural("A-1", "A-1x")).isNegative();
        assertThat(PlotGridService.compareNatural("A-1x", "A-1")).isPositive();
        assertThat(PlotGridService.compareNatural("A-5", "A-5")).isZero();
    }
}
