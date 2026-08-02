package com.plotchain.associate;

import java.util.List;

public record AdminAssociatePageResponse(
    List<AdminAssociateSummaryResponse> associates, int page, int size, long totalElements) {}
