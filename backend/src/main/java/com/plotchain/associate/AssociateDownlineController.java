package com.plotchain.associate;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

// My Team: the admin directory's list, scoped to the caller's own downline. Caller id comes only
// from the JWT principal.
@RestController
@RequestMapping("/api/associates/me/downline")
public class AssociateDownlineController {

    private final AdminAssociateService adminAssociateService;

    public AssociateDownlineController(AdminAssociateService adminAssociateService) {
        this.adminAssociateService = adminAssociateService;
    }

    @GetMapping
    public AdminAssociatePageResponse list(
        @AuthenticationPrincipal UUID associateId,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) KycStatus kycStatus,
        @RequestParam(required = false) KycStatus excludeKycStatus,
        @RequestParam(required = false) AssociateStatus status,
        @RequestParam(required = false) LocalDate joinedFrom,
        @RequestParam(required = false) LocalDate joinedTo,
        @RequestParam(defaultValue = "false") boolean newestFirst,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return adminAssociateService.listDownline(associateId, search, kycStatus, excludeKycStatus, status,
            joinedFrom, joinedTo, newestFirst, page, size);
    }
}
