package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Self-scoped by construction, same pattern as AssociateProfileController and
// KycSubmissionController: the target associate always comes from the verified JWT
// (@AuthenticationPrincipal), never a path/query/body parameter.
@RestController
@RequestMapping("/api/associates/me/bank-details")
public class AssociateBankDetailsController {

    private final AssociateBankDetailsService associateBankDetailsService;

    public AssociateBankDetailsController(AssociateBankDetailsService associateBankDetailsService) {
        this.associateBankDetailsService = associateBankDetailsService;
    }

    @GetMapping
    public AssociateBankDetailsResponse get(@AuthenticationPrincipal UUID associateId) {
        return associateBankDetailsService.getBankDetails(associateId);
    }

    @PutMapping
    public AssociateBankDetailsResponse update(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody UpdateAssociateBankDetailsRequest request
    ) {
        return associateBankDetailsService.updateBankDetails(associateId, request);
    }
}
