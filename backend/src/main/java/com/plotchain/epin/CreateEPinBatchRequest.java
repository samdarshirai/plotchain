package com.plotchain.epin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

// epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Decision 9): count is validated, not silently clamped -- an out-of-range value rejects the
// whole request with 400 (bean validation) instead of generating a different number of codes
// than asked for. 2,000 is the confirmed real ceiling (spec's Resolved decisions #1).
public record CreateEPinBatchRequest(
    @Min(1) @Max(2000) int count
) {}
