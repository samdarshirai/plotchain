package com.plotchain.withdrawal;

// Wallet/withdrawal unit 5 (Decision 9, Flow step 3): submission-time KYC gate. Decision 9 also
// calls for the SAME check to be re-run at approval-decision time (unit 7) -- this type is
// intentionally reusable there too, not unit-5-specific in name.
public class KycNotVerifiedException extends RuntimeException {
    // Takes the associate's human-readable userId (e.g. VP00001), not the internal UUID -- this
    // message is surfaced verbatim to the admin operator UI (SubmitWithdrawalComponent), which
    // needs an identifier an operator can act on, not a UUID.
    public KycNotVerifiedException(String associateUserId) {
        super("Associate KYC is not verified: " + associateUserId);
    }
}
