package com.plotchain.withdrawal;

// Wallet/withdrawal unit 7 (Decision 17, Flow "Decide" step 2): thrown when the CURRENT status
// forbids ANY decision at all (REJECTED/DISBURSED), or forbids the SPECIFIC decision requested
// (APPROVED -> re-approving is invalid; only REJECTED is a legal transition from APPROVED).
// Deliberately narrow in scope -- see this plan's "Note on a spec inconsistency" for why the
// blank-reason/invalid-decision-value cases are NOT routed through this type despite one summary
// table in the source spec bundling them here. Unit 8 (disburse) reuses this same type for
// "status != APPROVED" per the spec's Exceptions catalog.
public class InvalidWithdrawalStateException extends RuntimeException {
    public InvalidWithdrawalStateException(String message) {
        super(message);
    }
}
