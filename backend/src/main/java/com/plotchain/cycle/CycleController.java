package com.plotchain.cycle;

import com.plotchain.wallet.WalletCreditingResult;
import com.plotchain.wallet.WalletCreditingService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/cycles")
public class CycleController {

    private final CycleService cycleService;
    private final WalletCreditingService walletCreditingService;
    private final FinalReportService finalReportService;

    public CycleController(CycleService cycleService, WalletCreditingService walletCreditingService,
                           FinalReportService finalReportService) {
        this.cycleService = cycleService;
        this.finalReportService = finalReportService;
        this.walletCreditingService = walletCreditingService;
    }

    @GetMapping
    public CyclePageResponse list(
        @RequestParam(required = false) CycleStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return cycleService.list(status, page, size);
    }

    @GetMapping("/{id}")
    public CycleDetailResponse detail(@PathVariable UUID id) {
        return cycleService.getDetail(id);
    }

    // Literal path wins over "/{id}" in Spring MVC; security's "/api/admin/cycles/*" covers it (ADMIN).
    @GetMapping("/final-report")
    public FinalReportTableResponse finalReport(@RequestParam(required = false) String cycleIds) {
        return finalReportService.getFinalReportTable(parseIds(cycleIds));
    }

    // null = param absent (all cycles); "" = present but empty (no cycles); malformed UUID = 400.
    private static List<UUID> parseIds(String raw) {
        if (raw == null) return null;
        try {
            return Arrays.stream(raw.split(",")).map(String::trim).filter(x -> !x.isEmpty())
                .map(UUID::fromString).toList();
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid cycleIds");
        }
    }

    @PostMapping("/open")
    public CycleSummaryResponse open() {
        return cycleService.openCurrentCycle();
    }

    @PostMapping("/{id}/close")
    public CycleCloseResponse close(@PathVariable UUID id, @RequestBody(required = false) CycleCloseRequest request) {
        return cycleService.close(id, request == null ? null : request.endDate());
    }

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 1): cross-package addition to Cycle Management's own controller, same precedent
    // Cycle Management itself set for SaleRepository.findByCycleIdAndStatus -- the URL is
    // cycle-scoped even though the logic lives in the wallet package's WalletCreditingService.
    @PostMapping("/{id}/credit-wallets")
    public WalletCreditingResult creditWallets(@PathVariable UUID id) {
        return walletCreditingService.creditWallets(id);
    }
}
