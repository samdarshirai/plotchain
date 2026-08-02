package com.plotchain.associate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AdminAssociateDetailResponse(
    UUID id, String userId, String name, String email, String phone, String rankName,
    KycStatus kycStatus, AssociateStatus status, Instant joinedAt, Instant lastActiveAt,
    UUID sponsorId, String sponsorUserId, UUID parentId, String parentUserId, String position,
    long directDownlineCount, long totalDownlineCount,
    BigDecimal leftLegVolume, BigDecimal rightLegVolume) {}
