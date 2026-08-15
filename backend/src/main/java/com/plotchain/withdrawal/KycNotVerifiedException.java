package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 5 (Decision 9, Flow step 3): submission-time KYC gate. Decision 9 also
// calls for the SAME check to be re-run at approval-decision time (unit 7) -- this type is
// intentionally reusable there too, not unit-5-specific in name.
public class KycNotVerifiedException extends RuntimeException {
    public KycNotVerifiedException(UUID associateId) {
        super("Associate KYC is not verified: " + associateId);
    }
}
