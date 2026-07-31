package com.plotchain.projects;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlotServiceTest {

    @Mock PlotRepository plotRepository;
    // SettingsAuditService is a concrete class -- a real instance is built over mocked
    // (interface) repositories per the repo's established pattern (see CompanyProfileServiceTest).
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    PlotService plotService;

    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        plotService = new PlotService(plotRepository, settingsAuditService);
    }

    private Plot seedPlot() {
        return new Plot(PLOT_ID, PROJECT_ID, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.AVAILABLE);
    }

    private PlotRequest requestWithPlotNo(String plotNo) {
        return new PlotRequest(plotNo, "NORMAL", new BigDecimal("1200.00"), new BigDecimal("500.00"),
            new BigDecimal("600000.00"), "AVAILABLE");
    }

    @Test
    void listReturnsAPageResponseFromTheRepositoryPage() {
        Page<Plot> page = new PageImpl<>(List.of(seedPlot()), PageRequest.of(0, 20), 1);
        when(plotRepository.findAllByProjectId(eq(PROJECT_ID), any())).thenReturn(page);

        PlotPageResponse response = plotService.list(PROJECT_ID, 0, 20);

        assertThat(response.plots()).hasSize(1);
        assertThat(response.plots().get(0).plotNo()).isEqualTo("A-101");
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
    }

    @Test
    void getThrowsWhenPlotDoesNotExistUnderThatProject() {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> plotService.get(PROJECT_ID, PLOT_ID))
            .isInstanceOf(PlotNotFoundException.class);
    }

    @Test
    void createSavesAPlotWithGeneratedId() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of());

        PlotResponse response = plotService.create(PROJECT_ID, requestWithPlotNo("A-101"), ACTOR_ID);

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        Plot saved = captor.getValue();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getProjectId()).isEqualTo(PROJECT_ID);
        assertThat(saved.getPlotNo()).isEqualTo("A-101");
        assertThat(saved.getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        assertThat(response.plotNo()).isEqualTo("A-101");
    }

    @Test
    void createRecordsAnAuditEntry() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of());

        plotService.create(PROJECT_ID, requestWithPlotNo("A-101"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Created plot A-101");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"plotNo\":\"A-101\"");
    }

    @Test
    void createDefaultsBlankStatusToAvailable() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101"))).thenReturn(List.of());
        PlotRequest request = new PlotRequest("A-101", "NORMAL", new BigDecimal("1200.00"),
            new BigDecimal("500.00"), new BigDecimal("600000.00"), null);

        plotService.create(PROJECT_ID, request, ACTOR_ID);

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.AVAILABLE);
    }

    @Test
    void createThrowsWhenPlotNoAlreadyExistsInProject() {
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101")))
            .thenReturn(List.of(seedPlot()));

        assertThatThrownBy(() -> plotService.create(PROJECT_ID, requestWithPlotNo("A-101"), ACTOR_ID))
            .isInstanceOf(DuplicatePlotNumberException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void updateChangesFieldsOfAnExistingPlot() {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(seedPlot()));
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-102"))).thenReturn(List.of());

        PlotResponse response = plotService.update(PROJECT_ID, PLOT_ID, requestWithPlotNo("A-102"), ACTOR_ID);

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getPlotNo()).isEqualTo("A-102");
        assertThat(response.plotNo()).isEqualTo("A-102");
    }

    @Test
    void updateRecordsAnAuditEntry() {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(seedPlot()));
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-102"))).thenReturn(List.of());

        plotService.update(PROJECT_ID, PLOT_ID, requestWithPlotNo("A-102"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Updated plot A-102");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"id\":")
            .contains("\"plotNo\":\"A-101\"")
            .contains("\"after\":{\"id\":")
            .contains("\"plotNo\":\"A-102\"");
    }

    @Test
    void updateAllowsKeepingTheSamePlotNo() {
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(seedPlot()));
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-101")))
            .thenReturn(List.of(seedPlot()));

        plotService.update(PROJECT_ID, PLOT_ID, requestWithPlotNo("A-101"), ACTOR_ID);

        verify(plotRepository).save(any());
    }

    @Test
    void updateThrowsWhenNewPlotNoBelongsToADifferentExistingPlot() {
        Plot otherPlot = new Plot(UUID.randomUUID(), PROJECT_ID, "A-102", PlotType.NORMAL,
            new BigDecimal("1000.00"), new BigDecimal("400.00"), new BigDecimal("400000.00"), PlotStatus.AVAILABLE);
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(seedPlot()));
        when(plotRepository.findAllByProjectIdAndPlotNoIn(PROJECT_ID, List.of("A-102")))
            .thenReturn(List.of(otherPlot));

        assertThatThrownBy(() -> plotService.update(PROJECT_ID, PLOT_ID, requestWithPlotNo("A-102"), ACTOR_ID))
            .isInstanceOf(DuplicatePlotNumberException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void deleteRemovesThePlot() {
        Plot plot = seedPlot();
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(plot));

        plotService.delete(PROJECT_ID, PLOT_ID, ACTOR_ID);

        verify(plotRepository).delete(plot);
    }

    @Test
    void deleteRecordsAnAuditEntry() {
        Plot plot = seedPlot();
        when(plotRepository.findByIdAndProjectId(PLOT_ID, PROJECT_ID)).thenReturn(Optional.of(plot));

        plotService.delete(PROJECT_ID, PLOT_ID, ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PROJECTS");
        assertThat(saved.getSummary()).isEqualTo("Deleted plot A-101");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"deleted\":{\"id\":")
            .contains("\"plotNo\":\"A-101\"");
    }
}
