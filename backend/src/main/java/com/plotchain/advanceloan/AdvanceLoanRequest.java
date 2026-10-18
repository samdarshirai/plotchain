package com.plotchain.advanceloan;

import com.plotchain.expense.PayMode;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record AdvanceLoanRequest(@NotNull UUID associateId, @NotNull LocalDate loanDate, @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
    @NotNull PayMode payMode, @Size(max = 100) String bankName, @Size(max = 100) String instrumentNo, @Size(max = 500) String remarks) {}
