package com.plotchain.expense;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseRequest(
    @NotNull LocalDate expenseDate,
    @NotNull UUID expenseTypeId,
    UUID projectId,
    @NotBlank @Size(max = 150) String payTo,
    @NotNull @Positive BigDecimal amount,
    @NotNull PayMode payMode,
    @Size(max = 100) String bankName,
    @Size(max = 100) String txnNo,
    @Size(max = 500) String remarks
) {}
