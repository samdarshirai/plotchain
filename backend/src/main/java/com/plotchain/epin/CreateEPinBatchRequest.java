package com.plotchain.epin;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.Instant;

// expiresAt is optional (null = never expires); when present it must be in the future
// (epin-blog-extension spec, Data model / Endpoints). count stays validated, not clamped
// (2026-08-03 spec Decision 9).
public record CreateEPinBatchRequest(
    @Min(1) @Max(2000) int count,
    @Future Instant expiresAt
) {
    public CreateEPinBatchRequest(int count) {
        this(count, null);
    }
}
