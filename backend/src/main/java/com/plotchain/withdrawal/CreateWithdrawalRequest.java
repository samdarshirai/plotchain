package com.plotchain.withdrawal;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateWithdrawalRequest(
    @NotNull UUID associateId,
    @NotNull @Positive BigDecimal amount
) {}
