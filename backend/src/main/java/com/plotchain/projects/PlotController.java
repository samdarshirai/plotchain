package com.plotchain.projects;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/projects/{projectId}/plots")
public class PlotController {

    private final PlotService plotService;

    public PlotController(PlotService plotService) {
        this.plotService = plotService;
    }

    @GetMapping
    public PlotPageResponse list(@PathVariable UUID projectId,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        return plotService.list(projectId, page, size);
    }

    @GetMapping("/{plotId}")
    public PlotResponse get(@PathVariable UUID projectId, @PathVariable UUID plotId) {
        return plotService.get(projectId, plotId);
    }

    @PostMapping
    public ResponseEntity<PlotResponse> create(@PathVariable UUID projectId, @Valid @RequestBody PlotRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(plotService.create(projectId, request));
    }

    @PutMapping("/{plotId}")
    public PlotResponse update(@PathVariable UUID projectId, @PathVariable UUID plotId, @Valid @RequestBody PlotRequest request) {
        return plotService.update(projectId, plotId, request);
    }

    @DeleteMapping("/{plotId}")
    public ResponseEntity<Void> delete(@PathVariable UUID projectId, @PathVariable UUID plotId) {
        plotService.delete(projectId, plotId);
        return ResponseEntity.noContent().build();
    }
}
