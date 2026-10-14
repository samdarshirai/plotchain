package com.plotchain.income;

import java.math.BigDecimal;
import java.util.List;

public record AssociateLedgerPageResponse(
    List<AssociateLedgerEntryResponse> entries, int page, int size, long totalElements,
    BigDecimal totalGrossAmount) {}
