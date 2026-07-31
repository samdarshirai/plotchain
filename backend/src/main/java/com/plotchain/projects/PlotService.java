package com.plotchain.projects;

import com.plotchain.company.SettingsAuditService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PlotService {

    private final PlotRepository plotRepository;
    private final SettingsAuditService settingsAuditService;

    public PlotService(PlotRepository plotRepository, SettingsAuditService settingsAuditService) {
        this.plotRepository = plotRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public PlotPageResponse list(UUID projectId, int page, int size) {
        Page<Plot> result = plotRepository.findAllByProjectId(projectId, PageRequest.of(page, size));
        List<PlotResponse> plots = result.getContent().stream().map(PlotService::toResponse).toList();
        return new PlotPageResponse(plots, page, size, result.getTotalElements());
    }

    public PlotResponse get(UUID projectId, UUID plotId) {
        return toResponse(findOrThrow(projectId, plotId));
    }

    public PlotResponse create(UUID projectId, PlotRequest request, UUID actorId) {
        assertPlotNoAvailable(projectId, request.plotNo(), null);
        Plot plot = new Plot(
            UUID.randomUUID(),
            projectId,
            request.plotNo(),
            PlotType.valueOf(request.plotType()),
            request.areaSqft(),
            request.rate(),
            request.price(),
            resolveStatus(request.status())
        );
        plotRepository.save(plot);
        PlotResponse response = toResponse(plot);
        settingsAuditService.record("PROJECTS", "Created plot " + request.plotNo(), response, actorId);
        return response;
    }

    public PlotResponse update(UUID projectId, UUID plotId, PlotRequest request, UUID actorId) {
        Plot plot = findOrThrow(projectId, plotId);
        assertPlotNoAvailable(projectId, request.plotNo(), plotId);
        PlotResponse before = toResponse(plot);
        plot.setPlotNo(request.plotNo());
        plot.setPlotType(PlotType.valueOf(request.plotType()));
        plot.setAreaSqft(request.areaSqft());
        plot.setRate(request.rate());
        plot.setPrice(request.price());
        plot.setStatus(resolveStatus(request.status()));
        plotRepository.save(plot);
        PlotResponse after = toResponse(plot);
        settingsAuditService.record("PROJECTS", "Updated plot " + request.plotNo(),
            Map.of("before", before, "after", after), actorId);
        return after;
    }

    public void delete(UUID projectId, UUID plotId, UUID actorId) {
        Plot plot = findOrThrow(projectId, plotId);
        plotRepository.delete(plot);
        settingsAuditService.record("PROJECTS", "Deleted plot " + plot.getPlotNo(),
            Map.of("deleted", toResponse(plot)), actorId);
    }

    private void assertPlotNoAvailable(UUID projectId, String plotNo, UUID excludingPlotId) {
        boolean takenByAnotherPlot = plotRepository.findAllByProjectIdAndPlotNoIn(projectId, List.of(plotNo)).stream()
            .anyMatch(existing -> !existing.getId().equals(excludingPlotId));
        if (takenByAnotherPlot) {
            throw new DuplicatePlotNumberException("Plot number already in use for this project: " + plotNo);
        }
    }

    private static PlotStatus resolveStatus(String status) {
        return (status == null || status.isBlank()) ? PlotStatus.AVAILABLE : PlotStatus.valueOf(status);
    }

    private Plot findOrThrow(UUID projectId, UUID plotId) {
        return plotRepository.findByIdAndProjectId(plotId, projectId).orElseThrow(() -> new PlotNotFoundException(plotId));
    }

    private static PlotResponse toResponse(Plot plot) {
        return new PlotResponse(
            plot.getId(),
            plot.getPlotNo(),
            plot.getPlotType().name(),
            plot.getAreaSqft(),
            plot.getRate(),
            plot.getPrice(),
            plot.getStatus().name()
        );
    }
}
