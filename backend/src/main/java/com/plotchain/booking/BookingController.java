package com.plotchain.booking;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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

    // Add Plot EMI: free-amount top-up applied to the oldest PENDING instalments. Returns the updated booking (200).
    @PostMapping("/{id}/top-up")
    public BookingResponse topUp(@PathVariable UUID id, @Valid @RequestBody TopUpRequest request,
                                 @AuthenticationPrincipal UUID actorId) {
        return bookingService.topUp(id, request, actorId);
    }

    // Admin cancels an ACTIVE booking (Decisions 4, 12). Returns the updated booking (200), like
    // pay/confirm: the admin UI needs the refreshed status and paid/due totals (VOID rows, due = 0).
    @PostMapping("/{id}/cancel")
    public BookingResponse cancel(@PathVariable UUID id, @Valid @RequestBody CancelBookingRequest request,
                                  @AuthenticationPrincipal UUID actorId) {
        return bookingService.cancelBooking(id, request, actorId);
    }

    // Admin moves an ACTIVE booking to another AVAILABLE plot of the same project; totals and the
    // unpaid schedule are recalculated from the new plot. Returns the updated booking (200).
    @PostMapping("/{id}/transfer-plot")
    public BookingResponse transferPlot(@PathVariable UUID id, @Valid @RequestBody TransferPlotRequest request,
                                        @AuthenticationPrincipal UUID actorId) {
        return bookingService.transferPlot(id, request, actorId);
    }

    // Admin moves PAID money from this booking to another ACTIVE booking of the same buyer. Returns the source booking (200).
    @PostMapping("/{id}/move-money")
    public BookingResponse moveMoney(@PathVariable UUID id, @Valid @RequestBody MoveMoneyRequest request,
                                     @AuthenticationPrincipal UUID actorId) {
        return bookingService.moveMoney(id, request, actorId);
    }

    // Edit booking details while none of its payments is confirmed.
    @PutMapping("/{id}")
    public BookingResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateBookingRequest request,
                                  @AuthenticationPrincipal UUID actorId) {
        return bookingService.updateBooking(id, request, actorId);
    }

    // Edit an unconfirmed (ENTERED) payment. Same body as top-up.
    @PutMapping("/{id}/payments/{number}")
    public BookingResponse updatePayment(@PathVariable UUID id, @PathVariable int number,
                                         @Valid @RequestBody TopUpRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return bookingService.updatePayment(id, number, request, actorId);
    }

    // Delete an unconfirmed (ENTERED) payment; its amount returns to the pending schedule.
    @DeleteMapping("/{id}/payments/{number}")
    public BookingResponse deletePayment(@PathVariable UUID id, @PathVariable int number,
                                         @AuthenticationPrincipal UUID actorId) {
        return bookingService.deletePayment(id, number, actorId);
    }
}
