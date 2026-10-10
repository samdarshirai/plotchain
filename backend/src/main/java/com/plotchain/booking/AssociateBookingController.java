package com.plotchain.booking;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// Bare @RestController, same shape as AssociateSaleController -- SecurityConfig's own comment
// there explains why: a class-level @RequestMapping("/api/admin/bookings") on BookingController
// would make an absolute-path method mapping here compose incorrectly. No SecurityConfig matcher
// needed either: a bare GET never collides with the blanket POST/PUT/PATCH/DELETE write rules,
// so it falls through to anyRequest().authenticated() the same way GET /api/associates/me/sales
// already does with no matcher of its own.
@RestController
public class AssociateBookingController {

    private final BookingService bookingService;

    public AssociateBookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    // Self-scoped by construction: associateId always comes from the verified JWT, never the
    // request -- same reasoning as AssociateSaleController.getMySales.
    @GetMapping("/api/associates/me/bookings")
    public AssociateBookingPageResponse getMyBookings(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return bookingService.getMyBookings(associateId, page, size);
    }

    // Downline-scoped by the query itself (caller id from the JWT); leg = ALL | L | R.
    @GetMapping("/api/associates/me/team-bookings")
    public AssociateBookingPageResponse getTeamBookings(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(defaultValue = "ALL") String leg,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        String position = switch (leg) {
            case "ALL" -> null;
            case "L", "R" -> leg;
            default -> throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST, "leg must be ALL, L or R");
        };
        return bookingService.getTeamBookings(associateId, position, Math.max(page, 0), Math.min(size, 100));
    }

    // Report endpoints: from/to are inclusive calendar days, both optional.
    @GetMapping("/api/associates/me/reports/business")
    public BusinessReportResponse getMyBusiness(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        checkRange(from, to);
        return bookingService.getMyBusiness(associateId, from, to);
    }

    @GetMapping("/api/associates/me/reports/emi")
    public List<EmiReportRow> getEmiReport(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        checkRange(from, to);
        return bookingService.getEmiReport(associateId, from, to);
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST, "from must not be after to");
        }
    }
}
