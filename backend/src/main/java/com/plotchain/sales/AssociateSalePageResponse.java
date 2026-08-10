package com.plotchain.sales;

import java.util.List;

public record AssociateSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements) {}
