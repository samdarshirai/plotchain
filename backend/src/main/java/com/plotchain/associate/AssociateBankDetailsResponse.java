package com.plotchain.associate;

import java.time.Instant;

// No row yet (associate hasn't saved bank details) returns all-null fields rather than 404 --
// "no bank details on file" is a normal, expected state, not an error, same reasoning as
// AssociateKycStatusResponse returning an empty documents list rather than 404.
public record AssociateBankDetailsResponse(
    String bankName, String accountHolder, String accountNumber, String ifscCode,
    String accountType, Instant updatedAt
) {
    public static AssociateBankDetailsResponse empty() {
        return new AssociateBankDetailsResponse(null, null, null, null, null, null);
    }

    public static AssociateBankDetailsResponse from(AssociateBankDetails d) {
        return new AssociateBankDetailsResponse(
            d.getBankName(), d.getAccountHolder(), d.getAccountNumber(),
            d.getIfscCode(), d.getAccountType(), d.getUpdatedAt());
    }
}
