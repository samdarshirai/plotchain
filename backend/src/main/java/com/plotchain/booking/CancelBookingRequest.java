package com.plotchain.booking;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// reason is required (Flow "Cancel", 400 on blank). @Size(max = 255) matches
// plot_booking.cancel_reason VARCHAR(255) (V41) so an oversized reason is a 400, not a 500.
// The service stores it trimmed.
public record CancelBookingRequest(@NotBlank @Size(max = 255) String reason) {}
