package com.plotchain.associate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// currentTransactionPassword is NOT @NotBlank: it's required only when the associate already has
// one set (checked in TransactionPasswordService, not bean validation, since that decision needs
// the entity) -- ignored on the bootstrapping first-time-set path, same conditional-requirement
// shape as UpdateAssociateProfileRequest.transactionPassword.
public record SetTransactionPasswordRequest(
    String currentTransactionPassword,
    @NotBlank @Size(min = 6, message = "newTransactionPassword must be at least 6 characters") String newTransactionPassword
) {}
