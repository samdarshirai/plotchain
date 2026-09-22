package com.plotchain.associate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

// Same IFSC/account-type patterns as PayoutBankAccountRequest (com.plotchain.payments) --
// one IFSC validator in this codebase, reused rather than reinvented.
public record UpdateAssociateBankDetailsRequest(
    @NotBlank String bankName,
    @NotBlank String accountHolder,
    @NotBlank String accountNumber,
    @NotBlank @Pattern(regexp = "^[A-Z]{4}0[A-Z0-9]{6}$", message = "IFSC code must be in the format ABCD0123456")
    String ifscCode,
    @NotBlank @Pattern(regexp = "CURRENT|SAVINGS") String accountType
) {}
