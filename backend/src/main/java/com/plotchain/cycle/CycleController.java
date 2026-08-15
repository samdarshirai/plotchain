package com.plotchain.cycle;

import com.plotchain.wallet.WalletCreditingResult;
import com.plotchain.wallet.WalletCreditingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/cycles")
public class CycleController {

    private final CycleService cycleService;
    private final WalletCreditingService walletCreditingService;

    public CycleController(CycleService cycleService, WalletCreditingService walletCreditingService) {
        this.cycleService = cycleService;
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

    @PostMapping("/{id}/close")
    public CycleCloseResponse close(@PathVariable UUID id) {
        return cycleService.close(id);
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
