package com.plotchain.tree;

import java.math.BigDecimal;
import java.time.Instant;

// Admin Tree Explorer hover details -- fetched lazily per-node on hover (see
// TreeExplorerService.nodeDetails()), not baked into the bulk TreeNodeResponse tree, since the
// lifetime leg-business computation is O(cycles) per associate and the tree loads recursively.
public record TreeNodeDetailsResponse(
    String name, String userId, Instant joinedAt,
    String leftMemberId, String rightMemberId, // null when that leg is vacant
    long totalLeftMembers, long totalRightMembers,
    long activeLeftMembers, long activeRightMembers,
    BigDecimal totalLeftBusiness, BigDecimal totalRightBusiness,
    BigDecimal totalSelfBusiness) {}
