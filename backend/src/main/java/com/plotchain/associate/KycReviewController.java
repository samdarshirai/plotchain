package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/kyc")
public class KycReviewController {

    private final KycReviewService kycReviewService;

    public KycReviewController(KycReviewService kycReviewService) {
        this.kycReviewService = kycReviewService;
    }

    @GetMapping
    public KycPageResponse list(
        @RequestParam(defaultValue = "PENDING") KycStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return kycReviewService.list(status, page, size);
    }

    @PostMapping("/{associateId}/decision")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN','KYC_REVIEWER')")
    public KycQueueEntryResponse decide(@PathVariable UUID associateId, @Valid @RequestBody KycDecisionRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return kycReviewService.decide(associateId, request, actorId);
    }
}
