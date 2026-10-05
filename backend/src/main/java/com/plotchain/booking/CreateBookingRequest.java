package com.plotchain.booking;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

// totalAmount is always a server-computed snapshot of Plot.price at booking time (same convention
// as Sales' CreateSaleRequest omitting amount), and the installment split always derives from the
// singleton BookingEmiConfig policy. The one client-supplied amount is tokenAmount: it is recorded
// as installment 1, already PAID, and the rest of the price is split across the other installments.
// The upper bound (below the plot price) needs the plot, so BookingService checks it.
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String buyerName,
    @Size(max = 20) String buyerPhone,
    @NotNull @Positive BigDecimal tokenAmount
) {}
