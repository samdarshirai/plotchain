package com.plotchain.income;

import java.util.List;

public record AdminLedgerSummaryPageResponse(List<AdminLedgerSummaryRow> rows, int page, int size, long totalElements) {}
