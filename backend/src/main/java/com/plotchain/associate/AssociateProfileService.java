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
    private final TransactionPasswordVerifier transactionPasswordVerifier;

    public AssociateProfileService(AssociateRepository associateRepository,
                                    TransactionPasswordVerifier transactionPasswordVerifier) {
        this.associateRepository = associateRepository;
        this.transactionPasswordVerifier = transactionPasswordVerifier;
    }

    public AssociateProfileResponse getProfile(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return AssociateProfileResponse.from(associate);
    }

    public AssociateProfileResponse updateProfile(UUID associateId, UpdateAssociateProfileRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        transactionPasswordVerifier.requireIfSet(associate, request.transactionPassword());

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
        associate.setAddress(request.address());
        associate.setFatherHusbandName(request.fatherHusbandName());
        associate.setDateOfBirth(request.dateOfBirth());
        associate.setGender(request.gender());
        associate.setMaritalStatus(request.maritalStatus());
        associate.setState(request.state());
        associate.setDistrict(request.district());
        associate.setPostalCode(request.postalCode());
        associateRepository.save(associate);

        return AssociateProfileResponse.from(associate);
    }
}
