package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

public record AdminAssociateSummaryResponse(
    UUID id, String userId, String name, String rankName, KycStatus kycStatus,
    AssociateStatus status, Instant joinedAt, Instant lastActiveAt) {}
