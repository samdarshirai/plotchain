package com.plotchain.booking;

import java.util.List;

public record OverdueReportPageResponse(List<OverdueReportRow> rows, int page, int size, long totalElements) {}
