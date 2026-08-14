package com.plotchain.booking;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// No amount or installment-count override fields: totalAmount is always a server-computed
// snapshot of Plot.price at booking time (same convention as Sales' CreateSaleRequest omitting
// amount), and the installment split always derives from the singleton BookingEmiConfig policy,
// not a per-booking client override -- no acceptance criterion asks for one.
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId
) {}
