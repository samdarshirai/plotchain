package com.plotchain.booking;

import com.plotchain.expense.PayMode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

// Moves `amount` of PAID money from the path booking to targetBookingId (same buyer). What is left on the
// source is kept, unless refundRemainder is true: then the source is cancelled and the leftover refunded
// after chargePct (35..100) of it is charged; chargePct and payMode are then required.
public record MoveMoneyRequest(
    @NotNull UUID targetBookingId,
    @NotNull @DecimalMin("1") BigDecimal amount,
    boolean refundRemainder,
    @DecimalMin("35") @DecimalMax("100") BigDecimal chargePct,
    PayMode payMode,
    @Size(max = 255) String reason) {}
