package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record EmiInstallmentResponse(
    int installmentNumber,
    BigDecimal amount,
    LocalDate dueDate,
    InstallmentStatus status,
    Instant paidAt,
    boolean overdue
) {}
