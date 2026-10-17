package com.plotchain.booking;

import java.util.List;

public record PlotTransferPageResponse(List<PlotTransferRow> transfers, int page, int size, long totalElements) {}
