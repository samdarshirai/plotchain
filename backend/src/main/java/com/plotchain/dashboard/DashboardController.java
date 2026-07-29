package com.plotchain.dashboard;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/associates/me/dashboard")
    public DashboardResponse getDashboard(@AuthenticationPrincipal UUID associateId) {
        return dashboardService.getDashboard(associateId);
    }
}
