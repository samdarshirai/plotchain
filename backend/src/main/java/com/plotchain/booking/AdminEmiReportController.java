package com.plotchain.booking;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// Bare @RestController with an absolute path (same shape as AssociateBookingController / AdminBookingRegisterController).
@RestController
public class AdminEmiReportController {

    private final OverdueReportService overdueReportService;
    private final LastEmiReportService lastEmiReportService;

    public AdminEmiReportController(OverdueReportService overdueReportService, LastEmiReportService lastEmiReportService) {
        this.overdueReportService = overdueReportService;
        this.lastEmiReportService = lastEmiReportService;
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

    @GetMapping("/api/admin/emi-reports/last-emi")
    public List<LastEmiRow> lastEmi(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID projectId
    ) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
        return lastEmiReportService.report(from, to, projectId);
    }
}
