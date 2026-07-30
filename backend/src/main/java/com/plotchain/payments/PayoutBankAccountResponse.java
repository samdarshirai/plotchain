package com.plotchain.payments;

import java.time.Instant;

public record PayoutBankAccountResponse(
    String bankName,
    String accountHolder,
    String accountNumber,
    String ifscCode,
    String accountType,
    Instant updatedAt
) {}
