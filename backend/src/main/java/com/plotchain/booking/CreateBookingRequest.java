package com.plotchain.booking;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

// No amount or installment-count override fields: totalAmount is always a server-computed
// snapshot of Plot.price at booking time (same convention as Sales' CreateSaleRequest omitting
// amount), and the installment split always derives from the singleton BookingEmiConfig policy,
// not a per-booking client override -- no acceptance criterion asks for one.
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String buyerName,
    @Size(max = 20) String buyerPhone
) {}
