package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Self-scoped by construction, same pattern as PasswordController (/api/associates/me/password)
// and KycSubmissionController (/api/associates/me/kyc): the target associate always comes from
// the verified JWT (@AuthenticationPrincipal), never a path/query/body parameter, so no caller
// can read or edit another associate's profile. Deliberately thin -- all business logic
// (email-uniqueness enforcement, entity lookup) lives in AssociateProfileService.
@RestController
@RequestMapping("/api/associates/me/profile")
public class AssociateProfileController {

    private final AssociateProfileService associateProfileService;

    public AssociateProfileController(AssociateProfileService associateProfileService) {
        this.associateProfileService = associateProfileService;
    }

    @GetMapping
    public AssociateProfileResponse get(@AuthenticationPrincipal UUID associateId) {
        return associateProfileService.getProfile(associateId);
    }

    @PutMapping
    public AssociateProfileResponse update(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody UpdateAssociateProfileRequest request
    ) {
        return associateProfileService.updateProfile(associateId, request);
    }
}
