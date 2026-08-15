package com.plotchain.wallet;

import java.math.BigDecimal;

// Wallet/Withdrawal unit 2 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 13, Flow "GET /api/associates/me/wallet"): the sole response shape for the associate's
// own wallet balance. Deliberately just a balance -- no associateId echoed back, since this route
// is always scoped to the caller by construction.
public record WalletBalanceResponse(BigDecimal balance) {}
