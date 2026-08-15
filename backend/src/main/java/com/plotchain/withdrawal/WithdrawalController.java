package com.plotchain.withdrawal;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/withdrawal unit 5 added POST (submit). Unit 6
// (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals, ADMIN-only") adds this GET (list) method to
// this same @RequestMapping("/api/admin/withdrawals") class. Units 7-8 add the
// /{id}/decision, /{id}/disburse POSTs. ADMIN-only enforcement for GET is via SecurityConfig's
// explicit matcher (same as GET /api/admin/ledger) -- no @PreAuthorize needed on the method
// itself.
@RestController
@RequestMapping("/api/admin/withdrawals")
public class WithdrawalController {

    private final WithdrawalService withdrawalService;

    public WithdrawalController(WithdrawalService withdrawalService) {
        this.withdrawalService = withdrawalService;
    }

    @PostMapping
    public ResponseEntity<AdminWithdrawalResponse> submit(
            @Valid @RequestBody CreateWithdrawalRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(withdrawalService.submitRequest(request, actorId));
    }

    @GetMapping
    public AdminWithdrawalPageResponse list(
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) WithdrawalRequestStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return withdrawalService.adminList(associateId, status, page, size);
    }
}
