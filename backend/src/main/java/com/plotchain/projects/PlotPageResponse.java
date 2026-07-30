package com.plotchain.projects;

import java.util.List;

public record PlotPageResponse(List<PlotResponse> plots, int page, int size, long totalElements) {}
