package com.plotchain.associate;

import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.UUID;

// Self-scoped by construction: every method takes the caller's own associateId, sourced by
// AssociateProfileController from @AuthenticationPrincipal, never from request content -- same
// pattern as AuthService.changePassword and KycSubmissionService.
@Service
public class AssociateProfileService {

    private final AssociateRepository associateRepository;

    public AssociateProfileService(AssociateRepository associateRepository) {
        this.associateRepository = associateRepository;
    }

    public AssociateProfileResponse getProfile(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return AssociateProfileResponse.from(associate);
    }

    public AssociateProfileResponse updateProfile(UUID associateId, UpdateAssociateProfileRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        // Only check uniqueness when the email is actually changing -- resubmitting the
        // associate's own current email (a plain PUT of unchanged data) must not trip a false
        // conflict against itself. Reuses the exact existsByEmail()/EmailAlreadyRegisteredException
        // pattern AssociateProvisioningService.create() already established for create-time
        // uniqueness, so the rule is enforced identically at create and at edit.
        if (!Objects.equals(request.email(), associate.getEmail())) {
            if (request.email() != null && associateRepository.existsByEmail(request.email())) {
                throw new EmailAlreadyRegisteredException(request.email());
            }
            associate.setEmail(request.email());
        }

        associate.setName(request.name());
        associate.setPhone(request.phone());
        associateRepository.save(associate);

        return AssociateProfileResponse.from(associate);
    }
}
