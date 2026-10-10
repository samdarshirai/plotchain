package com.plotchain.booking;

import java.util.List;

public record BusinessReportResponse(List<BusinessReportRow> left, List<BusinessReportRow> right) {}
