package com.plotchain.epin;

import java.time.Instant;
import java.util.UUID;

// One row of the admin register, one field per EPin column (plus derived `expired`). Raw UUIDs,
// deliberately no associate name enrichment. Full code visibility, no masking.
public record EPinResponse(
    UUID id,
    String code,
    UUID batchId,
    EPinStatus status,
    UUID generatedBy,
    Instant generatedAt,
    Instant expiresAt,
    UUID allocatedTo,
    UUID allocatedBy,
    Instant allocatedAt,
    UUID redeemedTo,
    UUID redeemedBy,
    Instant redeemedAt,
    RedemptionType redemptionType,
    UUID linkedEntityId,
    UUID blockedBy,
    Instant blockedAt,
    String blockReason,
    boolean expired
) {}
