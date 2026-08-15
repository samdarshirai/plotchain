package com.plotchain.withdrawal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// Wallet/withdrawal unit 9 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 14): mirrors income.AssociateLedgerEntryResponse's pattern -- a separate record from
// AdminWithdrawalResponse, not one shared type with associate-identity fields nulled out.
// Deliberately carries NO associateId/associateUserId/associateName fields: every row returned
// by GET /api/associates/me/withdrawals is always the caller's own, so echoing an associate
// identity back would be redundant at best and misleading at worst.
public record AssociateWithdrawalResponse(
    UUID id,
    BigDecimal amount,
    WithdrawalRequestStatus status,
    String reason,
    String bankReference,
    Instant requestedAt,
    Instant decidedAt,
    Instant disbursedAt
) {}
