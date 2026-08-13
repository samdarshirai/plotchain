package com.plotchain.associate;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

// Self-scoped by construction: the target associate always comes from the verified JWT
// (@AuthenticationPrincipal), never from a path or query parameter, same pattern as
// PasswordController (/api/associates/me/password) and DashboardController
// (/api/associates/me/dashboard). Deliberately separate from KycReviewController
// (/api/admin/kyc, the admin review queue) -- this controller owns the associate-facing half
// of KYC only.
@RestController
@RequestMapping("/api/associates/me/kyc")
public class KycSubmissionController {

    private final KycSubmissionService kycSubmissionService;

    public KycSubmissionController(KycSubmissionService kycSubmissionService) {
        this.kycSubmissionService = kycSubmissionService;
    }

    @GetMapping
    public AssociateKycStatusResponse getStatus(@AuthenticationPrincipal UUID associateId) {
        return kycSubmissionService.getStatus(associateId);
    }

    @PostMapping("/documents/{documentType}")
    public KycDocumentSummary uploadDocument(
            @PathVariable String documentType,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UUID associateId) {
        return kycSubmissionService.uploadDocument(associateId, documentType, file);
    }
}
