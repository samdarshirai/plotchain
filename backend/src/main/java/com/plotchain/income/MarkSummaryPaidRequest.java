package com.plotchain.income;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MarkSummaryPaidRequest(
    @NotEmpty @Size(max = 200) List<@Valid @NotNull Row> rows,
    @NotNull Instant fulfilledAt,
    @Size(max = 500) String remark) {

    public record Row(@NotNull UUID associateId, @NotNull UUID cycleId) {}
}
