package com.plotchain.associate;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

// Self-scoped by construction: every method takes the caller's own associateId, sourced by
// AssociateBankDetailsController from @AuthenticationPrincipal -- same pattern as
// AssociateProfileService and KycSubmissionService.
@Service
public class AssociateBankDetailsService {

    private final AssociateRepository associateRepository;
    private final AssociateBankDetailsRepository associateBankDetailsRepository;

    public AssociateBankDetailsService(AssociateRepository associateRepository,
                                        AssociateBankDetailsRepository associateBankDetailsRepository) {
        this.associateRepository = associateRepository;
        this.associateBankDetailsRepository = associateBankDetailsRepository;
    }

    public AssociateBankDetailsResponse getBankDetails(UUID associateId) {
        associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return associateBankDetailsRepository.findByAssociateId(associateId)
            .map(AssociateBankDetailsResponse::from)
            .orElseGet(AssociateBankDetailsResponse::empty);
    }

    public AssociateBankDetailsResponse updateBankDetails(UUID associateId, UpdateAssociateBankDetailsRequest request) {
        associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        AssociateBankDetails details = associateBankDetailsRepository.findByAssociateId(associateId)
            .orElseGet(() -> {
                AssociateBankDetails d = new AssociateBankDetails();
                d.setId(UUID.randomUUID());
                d.setAssociateId(associateId);
                return d;
            });

        details.setBankName(request.bankName());
        details.setAccountHolder(request.accountHolder());
        details.setAccountNumber(request.accountNumber());
        details.setIfscCode(request.ifscCode());
        details.setAccountType(request.accountType());
        details.setUpdatedAt(Instant.now());
        associateBankDetailsRepository.save(details);

        return AssociateBankDetailsResponse.from(details);
    }
}
