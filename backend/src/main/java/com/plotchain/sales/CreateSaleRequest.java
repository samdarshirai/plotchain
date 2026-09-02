package com.plotchain.sales;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

// Mandatory-fields change on /admin/sales/new: buyerName, projectId, price, and note are the only
// required fields. plotId and buyerPhone are optional (a sale need not be tied to a specific
// inventory Plot); associateId stays required -- see SaleService.recordSale's leg-volume comment.
// price replaces the old Plot.price snapshot: Sale.amount is now always request.price(), never
// re-derived from a Plot.
public record CreateSaleRequest(
    UUID plotId,
    @NotNull UUID associateId,
    @NotBlank String buyerName,
    String buyerPhone,
    String buyerEmail,
    @NotNull UUID projectId,
    @NotNull @DecimalMin("0.01") BigDecimal price,
    @NotBlank String note
) {}
