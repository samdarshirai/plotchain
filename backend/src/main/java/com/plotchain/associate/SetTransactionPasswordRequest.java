package com.plotchain.associate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// currentTransactionPassword is NOT @NotBlank: it's required only when the associate already has
// one set (checked in TransactionPasswordService, not bean validation, since that decision needs
// the entity) -- ignored on the bootstrapping first-time-set path. Only this field is conditional;
// the transactionPassword on UpdateAssociateProfileRequest is always required now (checked by
// TransactionPasswordGuard).
public record SetTransactionPasswordRequest(
    String currentTransactionPassword,
    @NotBlank @Size(min = 6, message = "newTransactionPassword must be at least 6 characters") String newTransactionPassword
) {}
