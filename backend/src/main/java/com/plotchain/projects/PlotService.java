package com.plotchain.projects;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class PlotService {

    private final PlotRepository plotRepository;

    public PlotService(PlotRepository plotRepository) {
        this.plotRepository = plotRepository;
    }

    public PlotPageResponse list(UUID projectId, int page, int size) {
        Page<Plot> result = plotRepository.findAllByProjectId(projectId, PageRequest.of(page, size));
        List<PlotResponse> plots = result.getContent().stream().map(PlotService::toResponse).toList();
        return new PlotPageResponse(plots, page, size, result.getTotalElements());
    }

    public PlotResponse get(UUID projectId, UUID plotId) {
        return toResponse(findOrThrow(projectId, plotId));
    }

    public PlotResponse create(UUID projectId, PlotRequest request) {
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
        return toResponse(plot);
    }

    public PlotResponse update(UUID projectId, UUID plotId, PlotRequest request) {
        Plot plot = findOrThrow(projectId, plotId);
        assertPlotNoAvailable(projectId, request.plotNo(), plotId);
        plot.setPlotNo(request.plotNo());
        plot.setPlotType(PlotType.valueOf(request.plotType()));
        plot.setAreaSqft(request.areaSqft());
        plot.setRate(request.rate());
        plot.setPrice(request.price());
        plot.setStatus(resolveStatus(request.status()));
        plotRepository.save(plot);
        return toResponse(plot);
    }

    public void delete(UUID projectId, UUID plotId) {
        plotRepository.delete(findOrThrow(projectId, plotId));
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
