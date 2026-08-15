package com.plotchain.withdrawal;

import jakarta.validation.constraints.NotNull;

// Wallet/withdrawal unit 7 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Decide"): decision is typed as the same WithdrawalRequestStatus enum the entity uses
// (mirrors KycDecisionRequest's use of KycStatus) rather than a narrower two-value enum --
// WithdrawalService.decide() explicitly rejects any value other than APPROVED/REJECTED at
// runtime (InvalidWithdrawalDecisionException, 400), since the shared enum also carries
// REQUESTED/DISBURSED, which are never valid decision values. reason is validated
// conditionally (required only when decision == REJECTED), so it isn't @NotBlank here --
// same reasoning as KycDecisionRequest.reason.
public record WithdrawalDecisionRequest(@NotNull WithdrawalRequestStatus decision, String reason) {}
