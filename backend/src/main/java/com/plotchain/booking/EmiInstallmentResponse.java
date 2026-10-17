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
    boolean overdue,
    PaymentMode paymentMode,
    Instant confirmedAt,
    String bankName,
    String paymentRef
) {
    public EmiInstallmentResponse(int installmentNumber, BigDecimal amount, LocalDate dueDate,
                                  InstallmentStatus status, Instant paidAt, boolean overdue,
                                  PaymentMode paymentMode, Instant confirmedAt) {
        this(installmentNumber, amount, dueDate, status, paidAt, overdue, paymentMode, confirmedAt, null, null);
    }


    // Pre-U2 shape, kept so existing callers/tests compile.
    public EmiInstallmentResponse(int installmentNumber, BigDecimal amount, LocalDate dueDate,
                                  InstallmentStatus status, Instant paidAt, boolean overdue) {
        this(installmentNumber, amount, dueDate, status, paidAt, overdue, null, null);
    }
}
