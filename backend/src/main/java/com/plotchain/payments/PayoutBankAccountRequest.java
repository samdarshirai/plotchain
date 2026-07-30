package com.plotchain.payments;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record PayoutBankAccountRequest(
    @NotBlank String bankName,
    @NotBlank String accountHolder,
    @NotBlank String accountNumber,
    @NotBlank @Pattern(regexp = "^[A-Z]{4}0[A-Z0-9]{6}$", message = "IFSC code must be in the format ABCD0123456")
    String ifscCode,
    @NotBlank @Pattern(regexp = "CURRENT|SAVINGS") String accountType
) {}
