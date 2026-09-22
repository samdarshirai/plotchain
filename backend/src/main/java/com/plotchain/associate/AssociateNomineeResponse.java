package com.plotchain.associate;

import java.time.Instant;

// No row yet (associate hasn't saved nominee details) returns all-null fields rather than 404 --
// "no nominee on file" is a normal, expected state, not an error, same reasoning as
// AssociateBankDetailsResponse.empty().
public record AssociateNomineeResponse(String nomineeName, String relation, Instant updatedAt) {
    public static AssociateNomineeResponse empty() {
        return new AssociateNomineeResponse(null, null, null);
    }

    public static AssociateNomineeResponse from(AssociateNominee n) {
        return new AssociateNomineeResponse(n.getNomineeName(), n.getRelation(), n.getUpdatedAt());
    }
}
