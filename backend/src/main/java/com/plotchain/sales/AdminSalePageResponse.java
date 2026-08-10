package com.plotchain.sales;

import java.util.List;

public record AdminSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements) {}
