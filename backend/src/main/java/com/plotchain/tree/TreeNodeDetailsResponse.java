package com.plotchain.tree;

import java.math.BigDecimal;
import java.time.Instant;

// Admin Tree Explorer hover details -- fetched lazily per-node on hover (see
// TreeExplorerService.nodeDetails()). Member counts and self business stay lazy; lifetime leg
// business is also batch-loaded for the cards in TreeNodeResponse.
public record TreeNodeDetailsResponse(
    String name, String userId, Instant joinedAt,
    String leftMemberId, String rightMemberId, // null when that leg is vacant
    long totalLeftMembers, long totalRightMembers,
    long activeLeftMembers, long activeRightMembers,
    BigDecimal totalLeftBusiness, BigDecimal totalRightBusiness,
    BigDecimal totalSelfBusiness, BigDecimal totalTopUpBusiness) {}
