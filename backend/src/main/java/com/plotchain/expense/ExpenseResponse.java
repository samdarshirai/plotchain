package com.plotchain.expense;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseResponse(UUID id, LocalDate expenseDate, UUID expenseTypeId, String expenseTypeName, UUID projectId,
                              String projectName, String payTo, BigDecimal amount, PayMode payMode, String bankName,
                              String txnNo, String remarks) {}
