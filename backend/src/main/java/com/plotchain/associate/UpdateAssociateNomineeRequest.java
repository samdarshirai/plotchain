package com.plotchain.associate;

// Neither field is @NotBlank: an associate may clear their nominee back to unset, same
// nullable-means-optional reasoning as UpdateAssociateBankDetailsRequest's fields.
// transactionPassword is the same gate field as UpdateAssociateProfileRequest's --
// always required (TransactionPasswordGuard.require); a missing value yields 401, not 400.
public record UpdateAssociateNomineeRequest(String nomineeName, String relation, String transactionPassword) {}
