package com.plotchain.compensation;

import jakarta.validation.constraints.NotNull;

public record SelfPerformanceBonusConfigRequest(@NotNull Boolean enabled) {}
