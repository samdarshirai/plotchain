package com.plotchain.income;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MarkPaidRequest(
    @NotEmpty @Size(max = 200) List<@NotNull UUID> ids,
    @NotNull Instant fulfilledAt,
    @Size(max = 500) String remark) {}
