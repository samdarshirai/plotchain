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
    private final TransactionPasswordGuard transactionPasswordGuard;

    public AssociateProfileService(AssociateRepository associateRepository,
                                    TransactionPasswordGuard transactionPasswordGuard) {
        this.associateRepository = associateRepository;
        this.transactionPasswordGuard = transactionPasswordGuard;
    }

    public AssociateProfileResponse getProfile(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return AssociateProfileResponse.from(associate);
    }

    public AssociateProfileResponse updateProfile(UUID associateId, UpdateAssociateProfileRequest request) {
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        // Only check uniqueness when the phone is actually changing -- resubmitting the
        // associate's own current phone must not trip a false conflict against itself.
        if (!Objects.equals(request.phone(), associate.getPhone())
            && request.phone() != null && associateRepository.existsByPhone(request.phone())) {
            throw new PhoneAlreadyRegisteredException(request.phone());
        }
        associate.setEmail(request.email());

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
