package com.plotchain.income;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import java.util.UUID;

// Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// "Associate own ledger -- GET /api/associates/me/ledger, any authenticated associate"): a bare
// @RestController with one route, same shape as AssociateSaleController and DashboardController
// -- not added to LedgerController, whose class-level @RequestMapping("/api/admin/ledger") would
// make an absolute-path method mapping here compose incorrectly (Spring concatenates class +
// method paths rather than treating a leading "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/sales already does with no matcher of its own.
@RestController
public class AssociateLedgerController {

    private final LedgerService ledgerService;

    public AssociateLedgerController(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never from
    // the request -- there is no associateId request parameter on this method at all, so no
    // caller can view another associate's ledger through this route (Decisions 3, 4).
    @GetMapping("/api/associates/me/ledger")
    public AssociateLedgerPageResponse getMyLedger(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) IncomeType incomeType,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(required = false) LedgerEntryStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return ledgerService.myList(associateId, incomeType, cycleId, status, from, to, page, size);
    }

    @GetMapping("/api/associates/me/income-summary")
    public List<AdminLedgerSummaryRow> getMyIncomeSummary(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ledgerService.mySummary(associateId, from, to);
    }

    // Self-scoped like the routes above: the downline is always the JWT caller's own.
    @GetMapping("/api/associates/me/downline-income")
    public List<AdminLedgerSummaryRow> getMyDownlineIncome(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ledgerService.myDownlineSummary(associateId, from, to);
    }

        @GetMapping("/api/associates/me/reward-tiers")
    public List<AssociateRewardTierRow> getMyRewardTiers(@AuthenticationPrincipal UUID associateId) {
        return ledgerService.myRewardTiers(associateId);
    }

    @GetMapping("/api/associates/me/reward-business")
    public AssociateRewardBusiness getMyRewardBusiness(@AuthenticationPrincipal UUID associateId) {
        return ledgerService.myRewardBusiness(associateId);
    }

    @GetMapping("/api/associates/me/rewards-achieved")
    public List<AssociateRewardAchievedRow> getMyRewardsAchieved(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ledgerService.myRewardsAchieved(associateId, from, to);
    }
}
