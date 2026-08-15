package com.plotchain.withdrawal;

import java.util.List;

// Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals"): same page-wrapper shape as
// income.AdminLedgerPageResponse. Field named "requests" (not "entries") to match this domain's
// own vocabulary -- a future unit 9 AssociateWithdrawalPageResponse would follow the same
// naming, mirroring how income.AssociateLedgerPageResponse follows AdminLedgerPageResponse.
public record AdminWithdrawalPageResponse(
    List<AdminWithdrawalResponse> requests, int page, int size, long totalElements) {}
