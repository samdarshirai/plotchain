package com.plotchain.projects;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

// Plot-booking unit 10: availability grid read for any authenticated user. Deliberately a separate
// root from PlotController (/api/company/projects/...): the spec path is /api/projects/{id}/plots/grid.
// No SecurityConfig matcher: it falls through to anyRequest().authenticated() (pinned in SecurityConfigTest).
@RestController
@RequestMapping("/api/projects/{projectId}/plots/grid")
public class PlotGridController {

    private final PlotGridService plotGridService;

    public PlotGridController(PlotGridService plotGridService) {
        this.plotGridService = plotGridService;
    }

    @GetMapping
    public List<PlotGridResponse> grid(@PathVariable UUID projectId) {
        return plotGridService.grid(projectId);
    }
}
