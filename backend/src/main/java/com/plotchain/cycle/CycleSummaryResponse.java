package com.plotchain.cycle;

import java.time.LocalDate;
import java.util.UUID;

public record CycleSummaryResponse(UUID id, LocalDate periodStart, LocalDate periodEnd, CycleStatus status) {}
