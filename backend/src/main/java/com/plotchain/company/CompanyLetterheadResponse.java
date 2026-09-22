package com.plotchain.company;

// Associate-reachable subset of CompanyProfileResponse for letterhead-style rendering (e.g. the
// Welcome Letter). Deliberately excludes legalName/registrationNumber/contactName: GET
// /api/company/profile stays admin-only by design (see SecurityConfig), so this narrower response
// is the smallest surface an associate needs, not the full company profile.
public record CompanyLetterheadResponse(
    String displayName, String registeredAddress, String contactPhone, String contactEmail
) {
    public static CompanyLetterheadResponse from(CompanyProfileResponse profile) {
        return new CompanyLetterheadResponse(
            profile.displayName(), profile.registeredAddress(), profile.contactPhone(), profile.contactEmail());
    }
}
