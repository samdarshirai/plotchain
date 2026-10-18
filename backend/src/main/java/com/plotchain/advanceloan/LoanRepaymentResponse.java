package com.plotchain.advanceloan;

import com.plotchain.expense.PayMode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record LoanRepaymentResponse(UUID id, UUID loanId, String receiptNo, LocalDate paymentDate, UUID associateId,
    String associateUserId, String associateName, String associatePhone, BigDecimal amount, PayMode payMode,
    String bankName, String txnNo) {}
