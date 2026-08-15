package com.plotchain.withdrawal;

import java.util.List;

// Wallet/withdrawal unit 9: same page-wrapper shape as AdminWithdrawalPageResponse, field named
// "requests" to match that sibling's vocabulary (mirrors how income.AssociateLedgerPageResponse
// follows income.AdminLedgerPageResponse's "entries" field name).
public record AssociateWithdrawalPageResponse(
    List<AssociateWithdrawalResponse> requests, int page, int size, long totalElements) {}
