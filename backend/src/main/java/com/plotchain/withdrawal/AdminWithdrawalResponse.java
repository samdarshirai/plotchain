package com.plotchain.withdrawal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// Wallet/withdrawal unit 5 (Decision 14): mirrors Income/Ledger's AdminLedgerEntryResponse
// pattern -- associateUserId/associateName are resolved server-side, not left as a bare
// associateId for the caller to look up separately. A single submission needs only a single
// associate lookup (no batching); units 6/9's list endpoints are where a batch-load pattern
// (associateRepository.findAllById over a page) actually pays for itself.
public record AdminWithdrawalResponse(
    UUID id,
    UUID associateId,
    String associateUserId,
    String associateName,
    BigDecimal amount,
    WithdrawalRequestStatus status,
    String reason,
    String bankReference,
    Instant requestedAt,
    Instant decidedAt,
    Instant disbursedAt
) {}
