package com.plotchain.associate;

import java.util.UUID;

// Raised when the digital ID card is requested for an account that has no rank -- in practice
// an ADMIN, which by design has no MLM rank (see chk_associate_rank_required). The ID card is
// an associate-facing view; admins have no meaningful one -- the spec's own matrix says so
// explicitly ("No dedicated screen (not the persona this serves)"). Mirrors
// com.plotchain.dashboard.NoRankAssignedException / com.plotchain.compensation.NoRankAssignedException's
// identical reasoning; kept as its own class in this package rather than reused across
// packages, same cross-package-dependency avoidance those two already document -- associate is
// the base package both dashboard and compensation depend on, so reusing either of theirs here
// would risk a circular dependency in the other direction.
public class NoRankAssignedException extends RuntimeException {
    public NoRankAssignedException(UUID associateId) {
        super("No rank assigned to account " + associateId
            + "; the digital ID card does not apply to accounts without a rank");
    }
}
