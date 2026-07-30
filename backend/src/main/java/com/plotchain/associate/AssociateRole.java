package com.plotchain.associate;

public enum AssociateRole {
    ADMIN, ASSOCIATE, SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT;

    // The single definition of "may write" until Phase 10's per-role permission matrix
    // narrows it. SecurityConfig's blanket write rule is built from this, not from an
    // independently maintained list of roles.
    public boolean isAdminFamily() {
        return this != ASSOCIATE;
    }
}
