package com.plotchain.associate;

import com.plotchain.auth.AuthService;
import com.plotchain.auth.LoginResponse;
import com.plotchain.cycle.CycleService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/associates")
public class AdminAssociateController {

    private final AdminAssociateService adminAssociateService;

    private final AuthService authService;
    private final AssociateProfileService profileService;
    private final AssociateBankDetailsService bankDetailsService;
    private final AssociateNomineeService nomineeService;
    private final CycleService cycleService;

    public AdminAssociateController(AdminAssociateService adminAssociateService, AuthService authService,
        AssociateProfileService profileService, AssociateBankDetailsService bankDetailsService,
        AssociateNomineeService nomineeService, CycleService cycleService) {
        this.cycleService = cycleService;
        this.profileService = profileService;
        this.bankDetailsService = bankDetailsService;
        this.nomineeService = nomineeService;
        this.adminAssociateService = adminAssociateService;
        this.authService = authService;
    }

    @GetMapping
    public AdminAssociatePageResponse list(
        @RequestParam(required = false) String search,
        @RequestParam(required = false) UUID rank,
        @RequestParam(required = false) KycStatus kycStatus,
        @RequestParam(required = false) KycStatus excludeKycStatus,
        @RequestParam(required = false) AssociateStatus status,
        @RequestParam(required = false) LocalDate joinedFrom,
        @RequestParam(required = false) LocalDate joinedTo,
        @RequestParam(defaultValue = "false") boolean newestFirst,
        @RequestParam(required = false) String leg,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return adminAssociateService.list(search, rank, kycStatus, excludeKycStatus, status, joinedFrom, joinedTo, newestFirst, leg, page, size);
    }

    @GetMapping("/{id}")
    public AdminAssociateDetailResponse get(@PathVariable UUID id) {
        return adminAssociateService.get(id);
    }

    @GetMapping("/{id}/profile")
    public AssociateProfileResponse getProfile(@PathVariable UUID id) {
        return profileService.getProfile(id);
    }

    @PutMapping("/{id}/profile")
    @PreAuthorize("hasAuthority('ADMIN')")
    public AssociateProfileResponse updateProfile(@PathVariable UUID id,
        @Valid @RequestBody AdminUpdateAssociateProfileRequest request, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.updateProfile(id, request, actorId);
    }

    @GetMapping("/{id}/bank-details")
    public AssociateBankDetailsResponse getBankDetails(@PathVariable UUID id) {
        return bankDetailsService.getBankDetails(id);
    }

    @PutMapping("/{id}/bank-details")
    @PreAuthorize("hasAuthority('ADMIN')")
    public AssociateBankDetailsResponse updateBankDetails(@PathVariable UUID id,
        @Valid @RequestBody UpdateAssociateBankDetailsRequest request, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.updateBankDetails(id, request, actorId);
    }

    @GetMapping("/{id}/nominee")
    public AssociateNomineeResponse getNominee(@PathVariable UUID id) {
        return nomineeService.getNominee(id);
    }

    @PutMapping("/{id}/nominee")
    @PreAuthorize("hasAuthority('ADMIN')")
    public AssociateNomineeResponse updateNominee(@PathVariable UUID id,
        @RequestBody AdminUpdateAssociateNomineeRequest request, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.updateNominee(id, request, actorId);
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasAuthority('ADMIN')")
    public AdminAssociateDetailResponse suspend(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.suspend(id, actorId);
    }

    @PostMapping("/{id}/impersonate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public LoginResponse impersonate(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return authService.impersonate(id, actorId);
    }

    // Recomputes the open cycles' live income (tree-wide) and returns the associate, 404 if unknown.
    @PostMapping("/{id}/recalculate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public AdminAssociateDetailResponse recalculate(@PathVariable UUID id) {
        AdminAssociateDetailResponse associate = adminAssociateService.get(id);
        cycleService.refreshAllOpenCycles();
        return associate;
    }

    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasAuthority('ADMIN')")
    public AdminAssociateDetailResponse reactivate(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.reactivate(id, actorId);
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResetPasswordResponse resetPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.resetPassword(id, actorId);
    }

    @PostMapping("/{id}/reset-transaction-password")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResetPasswordResponse resetTransactionPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.resetTransactionPassword(id, actorId);
    }
}
