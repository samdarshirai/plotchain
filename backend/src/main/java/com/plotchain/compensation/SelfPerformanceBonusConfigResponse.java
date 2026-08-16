package com.plotchain.compensation;

import java.time.Instant;

public record SelfPerformanceBonusConfigResponse(boolean enabled, Instant updatedAt) {}
