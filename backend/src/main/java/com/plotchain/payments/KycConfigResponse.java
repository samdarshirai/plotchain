package com.plotchain.payments;

import java.time.Instant;
import java.util.List;

public record KycConfigResponse(
    String strictness,
    List<String> requiredDocuments,
    Instant updatedAt
) {}
