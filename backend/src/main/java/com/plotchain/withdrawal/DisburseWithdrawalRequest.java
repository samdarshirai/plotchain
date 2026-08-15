package com.plotchain.withdrawal;

import jakarta.validation.constraints.NotBlank;

// Wallet/withdrawal unit 8 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Disburse" step 3, Data model "New Java types"): bankReference is a manually-entered
// record of a bank transfer that happened outside this system (Decision resolved in Scope -- no
// real payment gateway integration is ever called here). @NotBlank enforces the spec's "blank
// bankReference -> 400" acceptance criterion directly via Bean Validation before
// WithdrawalService.disburse() ever runs, the same pattern CreateWithdrawalRequest's @Positive
// amount already establishes for its own single-field guard.
public record DisburseWithdrawalRequest(@NotBlank String bankReference) {}
