package com.plotchain.compensation;

import java.util.UUID;

// Raised when the associate rank-progress view is requested for an account that has no rank --
// in practice an ADMIN, which by design has no MLM rank (see chk_associate_rank_required). The
// rank-progress view is an associate-facing view; admins have no meaningful one. Mirrors
// com.plotchain.dashboard.NoRankAssignedException's identical reasoning; kept as its own class
// in this package rather than reused across packages, to avoid a compensation<->dashboard
// circular package dependency (dashboard already depends on compensation for
// CompensationPlanVersionRepository).
public class NoRankAssignedException extends RuntimeException {
    public NoRankAssignedException(UUID associateId) {
        super("No rank assigned to account " + associateId
            + "; the rank progress view does not apply to accounts without a rank");
    }
}
