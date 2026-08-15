package com.plotchain.wallet;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/Withdrawal unit 2 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 13, Flow "GET /api/associates/me/wallet"): a small dedicated endpoint, deliberately NOT
// folded into DashboardController/DashboardService -- the dashboard is a large aggregate query
// (rank progress, team snapshot, announcements, cycle income, leg volume) that a wallet/
// withdrawal-history screen shouldn't have to pull in full just to show a balance next to a
// withdrawal list. DashboardService.getDashboard()'s own WalletSummary read path is untouched by
// this controller -- both simply read WalletRepository independently via the same trivial
// single-row lookup (Decision 13's "plain reuse ... not duplication of logic worth centralizing
// further").
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated() --
// the same way GET /api/associates/me/dashboard and GET /api/associates/me/ledger already do with
// no matcher of their own.
@RestController
public class WalletController {

    private final WalletService walletService;

    public WalletController(WalletService walletService) {
        this.walletService = walletService;
    }

    // Self-scoped by construction: associateId comes from the verified JWT, never from the
    // request -- there is no way to query another associate's balance through this route.
    @GetMapping("/api/associates/me/wallet")
    public WalletBalanceResponse getMyWallet(@AuthenticationPrincipal UUID associateId) {
        return new WalletBalanceResponse(walletService.getBalance(associateId));
    }
}
