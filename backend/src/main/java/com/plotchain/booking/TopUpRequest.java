package com.plotchain.booking;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

// Free-amount payment against a booking's remaining pending balance (Add Plot EMI screen).
// paymentRef = TXN no, paidAt = TXN date (absent = now). bankName is required for every mode but CASH
// (checked in the service so the 400 names the rule).
public record TopUpRequest(
    @NotNull @DecimalMin(value = "0.00", inclusive = false) BigDecimal amount,
    @NotNull PaymentMode paymentMode,
    @Size(max = 100) String bankName,
    @NotBlank @Size(max = 100) String paymentRef,
    Instant paidAt
) {}
