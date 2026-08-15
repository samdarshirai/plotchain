package com.plotchain.withdrawal;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/withdrawal unit 9 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Own withdrawal history -- GET /api/associates/me/withdrawals, any authenticated associate"): a
// bare @RestController with one route, same shape as income.AssociateLedgerController and
// sales.AssociateSaleController -- not added to WithdrawalController, whose class-level
// @RequestMapping("/api/admin/withdrawals") would make an absolute-path method mapping here
// compose incorrectly (Spring concatenates class + method paths rather than treating a leading
// "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/ledger and GET /api/associates/me/wallet already do with
// no matcher of their own.
@RestController
public class AssociateWithdrawalController {

    private final WithdrawalService withdrawalService;

    public AssociateWithdrawalController(WithdrawalService withdrawalService) {
        this.withdrawalService = withdrawalService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never from
    // the request -- there is no associateId request parameter on this method at all, so no
    // caller can view another associate's withdrawal history through this route.
    @GetMapping("/api/associates/me/withdrawals")
    public AssociateWithdrawalPageResponse getMyWithdrawals(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) WithdrawalRequestStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return withdrawalService.myList(associateId, status, page, size);
    }
}
