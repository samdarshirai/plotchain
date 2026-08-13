package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

// Deliberately does NOT include kycStatus, KYC documents, or rankId: those are owned by
// AssociateKycStatusResponse (role-capability unit 8's KycSubmissionController) and the
// rank-progress endpoint (role-capability unit 9) respectively. This response is scoped to the
// editable profile identity/contact fields only, per this unit's own scope note.
public record AssociateProfileResponse(
    UUID id, String userId, String name, String phone, String email, Instant joinedAt
) {
    public static AssociateProfileResponse from(Associate a) {
        return new AssociateProfileResponse(
            a.getId(), a.getUserId(), a.getName(), a.getPhone(), a.getEmail(), a.getJoinedAt());
    }
}
