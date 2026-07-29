package com.plotchain.dashboard;

import java.util.UUID;

/**
 * Raised when the associate dashboard is requested for an account that has no rank — in
 * practice an ADMIN, which by design has no MLM rank (see chk_associate_rank_required). The
 * dashboard is an associate-facing view; admins have no meaningful one.
 */
public class NoRankAssignedException extends RuntimeException {
    public NoRankAssignedException(UUID associateId) {
        super("No rank assigned to account " + associateId
            + "; the associate dashboard does not apply to accounts without a rank");
    }
}
