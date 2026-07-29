package com.plotchain.dashboard;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// SECURITY: no authN/authZ yet — associateId is caller-supplied and unauthenticated.
// Gated by the not-yet-written auth/tenant-context platform plan (see plan's Global Constraints).
@RestController
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/associates/{associateId}/dashboard")
    public DashboardResponse getDashboard(@PathVariable UUID associateId) {
        return dashboardService.getDashboard(associateId);
    }
}
