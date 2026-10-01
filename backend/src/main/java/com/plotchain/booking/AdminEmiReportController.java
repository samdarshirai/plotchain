package com.plotchain.booking;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// Bare @RestController with an absolute path (same shape as AssociateBookingController / AdminBookingRegisterController).
@RestController
public class AdminEmiReportController {

    private final OverdueReportService overdueReportService;

    public AdminEmiReportController(OverdueReportService overdueReportService) {
        this.overdueReportService = overdueReportService;
    }

    @GetMapping("/api/admin/emi-reports/overdue")
    public OverdueReportPageResponse overdue(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);   // min 1: PageRequest.of rejects size < 1 (would be a 500)
        return overdueReportService.getOverdueReport(page, size);
    }
}
