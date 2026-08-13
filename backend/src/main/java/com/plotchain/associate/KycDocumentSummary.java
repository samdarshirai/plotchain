package com.plotchain.associate;

import java.time.Instant;

public record KycDocumentSummary(String documentType, String contentType, Instant uploadedAt) {}
