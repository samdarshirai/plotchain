package com.plotchain.income;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record RewardFulfilmentRequest(@NotNull Instant fulfilledAt, @Size(max = 500) String remark) {}
