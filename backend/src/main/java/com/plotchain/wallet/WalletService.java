package com.plotchain.wallet;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.UUID;

// Wallet/Withdrawal unit 2: routes WalletController through a service, matching every other
// associate-self endpoint's layering (AssociateLedgerController -> LedgerService, DashboardController
// -> DashboardService) instead of a controller talking to a repository directly.
@Service
public class WalletService {

    private final WalletRepository walletRepository;

    public WalletService(WalletRepository walletRepository) {
        this.walletRepository = walletRepository;
    }

    // Same lazy-default pattern DashboardService.getDashboard() already uses: a wallet that has
    // never been credited returns a balance of zero, not a 404.
    public BigDecimal getBalance(UUID associateId) {
        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId));
        return wallet.getBalance();
    }
}
