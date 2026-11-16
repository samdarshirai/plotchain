package com.plotchain.booking;

import com.plotchain.expense.PayMode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

// reason is required (Flow "Cancel", 400 on blank). @Size(max = 255) matches
// plot_booking.cancel_reason VARCHAR(255) (V41) so an oversized reason is a 400, not a 500.
// The service stores it trimmed.
// Plot Cancel screen: chargePct (35..100, % of the amount paid) switches on the charge/refund path
// (plot renamed, refund posted as an expense, payMode required when a refund is due). Null = legacy cancel.
public record CancelBookingRequest(
    @NotBlank @Size(max = 255) String reason,
    @DecimalMin("35") @DecimalMax("100") BigDecimal chargePct,
    PayMode payMode) {

    public CancelBookingRequest(String reason) {
        this(reason, null, null);
    }
}
