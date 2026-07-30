package com.plotchain.company;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class CompanyProfileService {

    private final CompanyProfileRepository companyProfileRepository;
    private final SettingsAuditService settingsAuditService;

    public CompanyProfileService(CompanyProfileRepository companyProfileRepository,
                                  SettingsAuditService settingsAuditService) {
        this.companyProfileRepository = companyProfileRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public CompanyProfileResponse getProfile() {
        return toResponse(currentProfile());
    }

    public CompanyProfileResponse updateProfile(CompanyProfileRequest request, UUID actorId) {
        CompanyProfile profile = currentProfile();
        CompanyProfileResponse before = toResponse(profile);
        profile.setDisplayName(request.displayName());
        profile.setLegalName(request.legalName());
        profile.setRegistrationNumber(request.registrationNumber());
        profile.setContactName(request.contactName());
        profile.setContactPhone(request.contactPhone());
        profile.setContactEmail(request.contactEmail());
        profile.setRegisteredAddress(request.registeredAddress());
        profile.setUpdatedAt(Instant.now());
        companyProfileRepository.save(profile);
        CompanyProfileResponse after = toResponse(profile);
        settingsAuditService.record("COMPANY_PROFILE", "Updated company profile",
            Map.of("before", before, "after", after), actorId);
        return after;
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
