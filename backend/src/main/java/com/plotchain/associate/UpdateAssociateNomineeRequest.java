package com.plotchain.associate;

// Neither field is @NotBlank: an associate may clear their nominee back to unset, same
// nullable-means-optional reasoning as UpdateAssociateBankDetailsRequest's fields.
// transactionPassword is the same conditional-gate field as UpdateAssociateProfileRequest's --
// required only once the associate has set one (TransactionPasswordVerifier.requireIfSet).
public record UpdateAssociateNomineeRequest(String nomineeName, String relation, String transactionPassword) {}
