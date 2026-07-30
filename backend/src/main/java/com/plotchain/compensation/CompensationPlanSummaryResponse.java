package com.plotchain.compensation;

import java.time.Instant;
import java.time.LocalDate;

public record CompensationPlanSummaryResponse(String versionLabel, LocalDate effectiveFrom, Instant createdAt) {}
