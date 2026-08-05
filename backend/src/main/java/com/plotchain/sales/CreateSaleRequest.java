package com.plotchain.sales;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// amount is deliberately absent: per the source spec's Decision 1, Sale.amount is always a
// server-computed snapshot of Plot.price at record time, never a client-supplied value.
public record CreateSaleRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank String buyerName,
    @NotBlank String buyerPhone,
    String buyerEmail
) {}
