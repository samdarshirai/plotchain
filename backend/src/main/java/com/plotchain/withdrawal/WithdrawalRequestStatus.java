package com.plotchain.withdrawal;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Data model section): the full four-value state machine, even though this unit (5) only ever
// creates rows in REQUESTED or auto-approved APPROVED. REJECTED (units 7's reject/cancel) and
// DISBURSED (unit 8) are built later, but the enum -- and the withdrawal_request table's own
// chk_withdrawal_request_status CHECK constraint (V22) -- carry all four from day one so later
// units don't need a schema change just to add a status value.
public enum WithdrawalRequestStatus {
    REQUESTED, APPROVED, REJECTED, DISBURSED
}
