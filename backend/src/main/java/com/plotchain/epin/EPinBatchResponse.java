package com.plotchain.epin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record EPinBatchResponse(
    UUID batchId,
    int count,
    List<String> codes,
    Instant generatedAt
) {}
