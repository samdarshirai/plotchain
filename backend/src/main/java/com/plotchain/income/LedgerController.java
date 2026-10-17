package com.plotchain.income;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 2): this class carries the /api/admin/ledger prefix at the class level. A follow-up
// unit adds a separate bare @RestController (no class-level prefix, full-path method mapping)
// for GET /api/associates/me/ledger -- the same split SaleController/AssociateSaleController
// already use, and for the same reason: Spring composes class-level + method-level paths, so an
// absolute method path declared here would NOT override "/api/admin/ledger". Both controllers
// will share one LedgerService; there's no write path on this domain to justify separate
// service classes either.
@RestController
@RequestMapping("/api/admin/ledger")
public class LedgerController {

    private final LedgerService ledgerService;

    public LedgerController(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    @GetMapping
    public AdminLedgerPageResponse list(
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) IncomeType incomeType,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(required = false) LedgerEntryStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return ledgerService.adminList(associateId, incomeType, cycleId, status, page, size);
    }

    @GetMapping("/summary")
    public AdminLedgerSummaryPageResponse summary(
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ledgerService.adminSummary(associateId, cycleId, Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    @PostMapping("/summary/mark-paid")
    public void markSummaryPaid(@Valid @RequestBody MarkSummaryPaidRequest request) {
        ledgerService.markSummaryPaid(request.rows(), request.fulfilledAt(), request.remark());
    }

    // Admin records payment date + remark on one ledger entry (also the Reward edit).
    @PostMapping("/{id}/fulfil")
    public AdminLedgerEntryResponse fulfil(@PathVariable UUID id, @Valid @RequestBody RewardFulfilmentRequest request) {
        return ledgerService.fulfilReward(id, request.fulfilledAt(), request.remark());
    }

    @PostMapping("/mark-paid")
    public void markPaid(@Valid @RequestBody MarkPaidRequest request) {
        ledgerService.markPaid(request.ids(), request.fulfilledAt(), request.remark());
    }
}
