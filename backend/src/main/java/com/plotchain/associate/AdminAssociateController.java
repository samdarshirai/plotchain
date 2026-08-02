package com.plotchain.associate;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/associates")
public class AdminAssociateController {

    private final AdminAssociateService adminAssociateService;

    public AdminAssociateController(AdminAssociateService adminAssociateService) {
        this.adminAssociateService = adminAssociateService;
    }

    @GetMapping
    public AdminAssociatePageResponse list(
        @RequestParam(required = false) String search,
        @RequestParam(required = false) UUID rank,
        @RequestParam(required = false) KycStatus kycStatus,
        @RequestParam(required = false) AssociateStatus status,
        @RequestParam(required = false) LocalDate joinedFrom,
        @RequestParam(required = false) LocalDate joinedTo,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return adminAssociateService.list(search, rank, kycStatus, status, joinedFrom, joinedTo, page, size);
    }

    @GetMapping("/{id}")
    public AdminAssociateDetailResponse get(@PathVariable UUID id) {
        return adminAssociateService.get(id);
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
    public AdminAssociateDetailResponse suspend(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.suspend(id, actorId);
    }

    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
    public AdminAssociateDetailResponse reactivate(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.reactivate(id, actorId);
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
    public ResetPasswordResponse resetPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.resetPassword(id, actorId);
    }
}
