package com.plotchain.advanceloan;

import com.plotchain.expense.PayMode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RepaymentRequest(@NotNull LocalDate paymentDate, @NotNull @Positive BigDecimal amount, @NotNull PayMode payMode,
    @Size(max = 100) String bankName, @Size(max = 100) String txnNo) {}
