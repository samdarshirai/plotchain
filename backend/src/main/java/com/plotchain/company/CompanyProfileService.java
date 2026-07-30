package com.plotchain.company;

import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class CompanyProfileService {

    private final CompanyProfileRepository companyProfileRepository;

    public CompanyProfileService(CompanyProfileRepository companyProfileRepository) {
        this.companyProfileRepository = companyProfileRepository;
    }

    public CompanyProfileResponse getProfile() {
        return toResponse(currentProfile());
    }

    public CompanyProfileResponse updateProfile(CompanyProfileRequest request) {
        CompanyProfile profile = currentProfile();
        profile.setDisplayName(request.displayName());
        profile.setLegalName(request.legalName());
        profile.setRegistrationNumber(request.registrationNumber());
        profile.setContactName(request.contactName());
        profile.setContactPhone(request.contactPhone());
        profile.setContactEmail(request.contactEmail());
        profile.setRegisteredAddress(request.registeredAddress());
        profile.setUpdatedAt(Instant.now());
        companyProfileRepository.save(profile);
        return toResponse(profile);
    }

    // The six fields SetupStateService's companyProfile step treats as required.
    // registrationNumber is deliberately excluded -- optional per spec.
    public boolean isComplete() {
        CompanyProfile profile = currentProfile();
        return isNotBlank(profile.getDisplayName())
            && isNotBlank(profile.getLegalName())
            && isNotBlank(profile.getContactName())
            && isNotBlank(profile.getContactPhone())
            && isNotBlank(profile.getContactEmail())
            && isNotBlank(profile.getRegisteredAddress());
    }

    private static boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    private CompanyProfile currentProfile() {
        return companyProfileRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("company_profile row missing - V6 migration seeds it"));
    }

    private static CompanyProfileResponse toResponse(CompanyProfile profile) {
        return new CompanyProfileResponse(
            profile.getDisplayName(),
            profile.getLegalName(),
            profile.getRegistrationNumber(),
            profile.getContactName(),
            profile.getContactPhone(),
            profile.getContactEmail(),
            profile.getRegisteredAddress(),
            profile.getUpdatedAt()
        );
    }
}
