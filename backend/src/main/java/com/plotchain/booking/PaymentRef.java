package com.plotchain.booking;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record PaymentRef(@NotNull UUID bookingId, @Min(1) int installmentNumber) {}
