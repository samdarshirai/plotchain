package com.plotchain.booking;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// POST /confirm is ADMIN-only via SecurityConfig's blanket POST /api/** rule (all-or-nothing; returns the
// updated bookings). The GET list has its own exact-path ADMIN matcher (no blanket GET /api/admin/**).
@RestController
@RequestMapping("/api/admin/payments")
public class AdminPaymentController {

    private final BookingService bookingService;
    private final PaymentLedgerService paymentLedgerService;

    public AdminPaymentController(BookingService bookingService, PaymentLedgerService paymentLedgerService) {
        this.bookingService = bookingService;
        this.paymentLedgerService = paymentLedgerService;
    }

    @PostMapping("/confirm")
    public List<BookingResponse> confirm(@Valid @RequestBody ConfirmPaymentsRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return bookingService.confirmPayments(request.items(), actorId);
    }

    @GetMapping
    public PaymentPageResponse list(
            @RequestParam(defaultValue = "ENTERED") InstallmentStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (status != InstallmentStatus.ENTERED && status != InstallmentStatus.PAID) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be ENTERED or PAID");
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);
        return paymentLedgerService.list(status, from, to, projectId, page, size);
    }
}
