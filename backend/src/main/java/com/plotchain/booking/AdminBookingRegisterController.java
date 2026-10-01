package com.plotchain.booking;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Bare @RestController with an absolute path (same shape as AssociateBookingController): a
// class-level @RequestMapping("/api/admin/bookings") already sits on BookingController, which
// only maps POST/PATCH under it. This GET shares the path with POST /api/admin/bookings; Spring
// routes by HTTP method, so there is no ambiguity (pinned by getDoesNotCollideWithPostOnTheSamePath).
@RestController
public class AdminBookingRegisterController {

    private final BookingRegisterService registerService;

    public AdminBookingRegisterController(BookingRegisterService registerService) {
        this.registerService = registerService;
    }

    @GetMapping("/api/admin/bookings")
    public AdminBookingPageResponse list(
            @RequestParam(required = false) BookingStatus status,
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) UUID plotId,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(defaultValue = "false") boolean overdue,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);   // min 1: PageRequest.of rejects size < 1 (would be a 500)
        return registerService.list(status, associateId, plotId, projectId, overdue, page, size);
    }
}
