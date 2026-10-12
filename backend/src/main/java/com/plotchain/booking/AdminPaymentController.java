package com.plotchain.booking;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

// ADMIN-only via SecurityConfig's blanket POST /api/** rule. All-or-nothing; returns the updated bookings.
@RestController
@RequestMapping("/api/admin/payments")
public class AdminPaymentController {

    private final BookingService bookingService;

    public AdminPaymentController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @PostMapping("/confirm")
    public List<BookingResponse> confirm(@Valid @RequestBody ConfirmPaymentsRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return bookingService.confirmPayments(request.items(), actorId);
    }
}
