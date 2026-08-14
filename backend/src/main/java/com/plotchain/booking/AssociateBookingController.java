package com.plotchain.booking;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
}
