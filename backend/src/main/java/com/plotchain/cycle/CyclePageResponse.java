package com.plotchain.cycle;

import java.util.List;

public record CyclePageResponse(List<CycleSummaryResponse> cycles, int page, int size, long totalElements) {}
