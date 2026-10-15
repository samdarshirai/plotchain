package com.plotchain.booking;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.UUID;

// Bare @RestController with an absolute path (same shape as AssociateBookingController): a
// class-level @RequestMapping("/api/admin/bookings") already sits on BookingController, which
// only maps POST/PATCH under it. This GET shares the path with POST /api/admin/bookings; Spring
// routes by HTTP method, so there is no ambiguity (pinned by getDoesNotCollideWithPostOnTheSamePath).
@RestController
public class AdminBookingRegisterController {

    private final BookingRegisterService registerService;
    private final BookingService bookingService;

    public AdminBookingRegisterController(BookingRegisterService registerService, BookingService bookingService) {
        this.registerService = registerService;
        this.bookingService = bookingService;
    }

    // Unit 14a: single booking for the overdue click-through and the unit 11 banner deep link.
    @GetMapping("/api/admin/bookings/{id}")
    public BookingResponse get(@PathVariable UUID id) {
        return bookingService.getBooking(id);
    }

    @GetMapping("/api/admin/bookings/transferred")
    public AdminBookingPageResponse transferred(@RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return registerService.listTransferred(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    @GetMapping("/api/admin/bookings")
    public AdminBookingPageResponse list(
            @RequestParam(required = false) BookingStatus status,
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) UUID plotId,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(defaultValue = "false") boolean overdue,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate bookedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate bookedTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate cancelledFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate cancelledTo,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        checkRange(bookedFrom, bookedTo);
        checkRange(cancelledFrom, cancelledTo);
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);   // min 1: PageRequest.of rejects size < 1 (would be a 500)
        return registerService.list(status, associateId, plotId, projectId, overdue, bookedFrom, bookedTo,
            cancelledFrom, cancelledTo, q, page, size);
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
    }
}
