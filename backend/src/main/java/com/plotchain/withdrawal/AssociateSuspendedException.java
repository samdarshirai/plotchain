package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Submit a withdrawal request" step 2, Error handling table). Deliberately a SEPARATE type
// from com.plotchain.auth.AssociateSuspendedException: that one is a no-arg, 403-mapped exception
// AuthService throws when a SUSPENDED associate tries to log in THEMSELVES ("Your account has
// been suspended..."). This one is thrown when an ADMIN submits a withdrawal request ON BEHALF OF
// a SUSPENDED associate -- different actor, different HTTP status (409, not 403 -- the request
// itself is well-formed and authorized, it just targets an associate in the wrong state),
// different message. Same simple class name, different package/FQCN -- matches the source spec's
// literal naming rather than inventing a name the spec doesn't use. Do not merge these two types.
public class AssociateSuspendedException extends RuntimeException {
    public AssociateSuspendedException(UUID associateId) {
        super("Cannot submit a withdrawal for a suspended associate: " + associateId);
    }
}
