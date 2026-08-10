package com.plotchain.sales;

// reason is deliberately unvalidated here (no @NotBlank) -- per the source spec's Decision 6 /
// Data model section, void_reason is "required by the API when voiding, not by the DB
// constraint," mirroring how KycDecisionRequest's reason is conditionally required at the
// request-validation layer elsewhere in this codebase, not via bean validation on the request
// itself. This unit (Sales unit 4) only implements the reject-path guards (missing/
// already-voided Sale); actually persisting and validating reason belongs to Sales unit 5,
// which fills in flow steps 3-6 on SaleService.voidSale().
public record VoidSaleRequest(String reason) {}
