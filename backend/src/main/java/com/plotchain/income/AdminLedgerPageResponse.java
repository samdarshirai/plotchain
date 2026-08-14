package com.plotchain.income;

import java.util.List;

public record AdminLedgerPageResponse(
    List<AdminLedgerEntryResponse> entries, int page, int size, long totalElements) {}
