package com.plotchain.associate;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Deliberately does NOT include kycStatus, KYC documents, or rankId: those are owned by
// AssociateKycStatusResponse (role-capability unit 8's KycSubmissionController) and the
// rank-progress endpoint (role-capability unit 9) respectively. This response is scoped to the
// editable profile identity/contact fields only, per this unit's own scope note.
//
// fatherHusbandName..postalCode (profile screen redesign, "Viraj Acres" mockup's Personal
// Detail / Contact Detail sections) are all nullable, same as phone/email/address above --
// optional-to-fill-in, not a "required going forward" rule this unit has no product basis for.
public record AssociateProfileResponse(
    UUID id, String userId, String name, String phone, String email, String address, Instant joinedAt,
    String fatherHusbandName, LocalDate dateOfBirth, String gender, String maritalStatus,
    String state, String district, String postalCode
) {
    public static AssociateProfileResponse from(Associate a) {
        return new AssociateProfileResponse(
            a.getId(), a.getUserId(), a.getName(), a.getPhone(), a.getEmail(), a.getAddress(), a.getJoinedAt(),
            a.getFatherHusbandName(), a.getDateOfBirth(), a.getGender(), a.getMaritalStatus(),
            a.getState(), a.getDistrict(), a.getPostalCode());
    }
}
