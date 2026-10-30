package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

public record AdminAssociateSummaryResponse(
    UUID id, String userId, String name, String designation, KycStatus kycStatus,
    AssociateStatus status, Instant joinedAt, Instant lastActiveAt,
    String sponsorUserId, String position, AssociateRole role,
    String loginPassword, String transactionPassword) {}
