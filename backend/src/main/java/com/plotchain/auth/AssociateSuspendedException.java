package com.plotchain.auth;

// NOTE: com.plotchain.withdrawal.AssociateSuspendedException is a DISTINCT class with the same
// simple name (Wallet/withdrawal unit 5). That one takes a UUID, carries a different message, and
// is mapped to 409 (an admin submitting a withdrawal on behalf of a suspended associate); this one
// is no-arg, mapped to 403 (a suspended associate trying to log in themselves). Do not merge them.
public class AssociateSuspendedException extends RuntimeException {
    public AssociateSuspendedException() {
        super("Your account has been suspended. Please contact your administrator.");
    }
}
