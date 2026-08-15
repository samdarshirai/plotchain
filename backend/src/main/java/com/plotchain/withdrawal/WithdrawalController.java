package com.plotchain.withdrawal;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "POST /api/admin/withdrawals, ADMIN-only"). Only this one endpoint exists in this unit; units
// 6-8 add GET (list) and the /{id}/decision, /{id}/disburse POSTs to this same
// @RequestMapping("/api/admin/withdrawals") class. ADMIN-only enforcement is via SecurityConfig's
// explicit matcher (Task 7) plus the blanket POST "/api/**" rule, same as CycleController's
// close()/creditWallets() -- no @PreAuthorize needed on the method itself.
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
}
