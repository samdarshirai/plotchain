package com.plotchain.advanceloan;

import com.plotchain.expense.PayMode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record AdvanceLoanResponse(UUID id, UUID associateId, String associateUserId, String associateName, LocalDate loanDate,
    BigDecimal amount, BigDecimal previousDues, BigDecimal repaid, BigDecimal outstanding, PayMode payMode, String bankName,
    String instrumentNo, String remarks) {}
