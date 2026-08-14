package com.plotchain.booking;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
