package com.plotchain.booking;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    // Admin books a plot against any associate's record (data visibility matrix, Plot/project
    // inventory row, Admin column: "books plots against any associate's record") -- same
    // Admin-acts-on-an-associate's-behalf request shape as Sales' POST /api/admin/sales
    // (CreateSaleRequest: plotId + associateId, no client-supplied amount).
    @PostMapping
    public ResponseEntity<BookingResponse> create(@Valid @RequestBody CreateBookingRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(bookingService.createBooking(request));
    }

    // Admin records one installment's payment on an associate's behalf (Decisions 6, 12).
    // Returns the whole updated booking (200), not 204: the admin UI needs refreshed paid/due
    // totals, and unit 5's auto-confirm will flip status in this same call.
    @PatchMapping("/{id}/installments/{n}/pay")
    public BookingResponse pay(@PathVariable UUID id, @PathVariable("n") int installmentNumber,
                               @Valid @RequestBody RecordPaymentRequest request,
                               @AuthenticationPrincipal UUID actorId) {
        return bookingService.recordPayment(id, installmentNumber, request, actorId);
    }

    // Admin manually confirms an ACTIVE booking (Decisions 1, 2, 12), creating the linked Sale.
    // Allowed under MANUAL and AUTO_THRESHOLD. Returns the updated booking (200), like pay.
    @PostMapping("/{id}/confirm")
    public BookingResponse confirm(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return bookingService.confirmBooking(id, actorId);
    }

    // Admin cancels an ACTIVE booking (Decisions 4, 12). Returns the updated booking (200), like
    // pay/confirm: the admin UI needs the refreshed status and paid/due totals (VOID rows, due = 0).
    @PostMapping("/{id}/cancel")
    public BookingResponse cancel(@PathVariable UUID id, @Valid @RequestBody CancelBookingRequest request,
                                  @AuthenticationPrincipal UUID actorId) {
        return bookingService.cancelBooking(id, request, actorId);
    }

    // Admin transfers an ACTIVE booking to another ACTIVE associate (Decisions 5, 8, 12). Returns the
    // updated booking (200), like pay/confirm/cancel.
    @PostMapping("/{id}/transfer")
    public BookingResponse transfer(@PathVariable UUID id, @Valid @RequestBody TransferBookingRequest request,
                                    @AuthenticationPrincipal UUID actorId) {
        return bookingService.transferBooking(id, request.associateId(), actorId);
    }
}
