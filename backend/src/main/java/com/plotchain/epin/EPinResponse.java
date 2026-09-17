package com.plotchain.epin;

import java.time.Instant;
import java.util.UUID;

// epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Data model): one row of the admin register, one field per EPin column. Raw UUIDs for
// generatedBy/redeemedTo/redeemedBy/linkedEntityId -- deliberately no batch-resolved associate
// userId/name enrichment like AdminLedgerEntryResponse's associateUserId/associateName:
// nothing in this spec's Decisions/Flows asks for it (unlike the Income/Ledger spec's explicit
// Decisions 11-13), this is a backend-only unit, and a future screen unit can add an
// enrichment endpoint if the admin UI turns out to need associate names inline. Full code
// visibility, no masking (spec's Resolved decisions #4).
public record EPinResponse(
    UUID id,
    String code,
    UUID batchId,
    EPinStatus status,
    UUID generatedBy,
    Instant generatedAt,
    UUID redeemedTo,
    UUID redeemedBy,
    Instant redeemedAt,
    RedemptionType redemptionType,
    UUID linkedEntityId
) {}
