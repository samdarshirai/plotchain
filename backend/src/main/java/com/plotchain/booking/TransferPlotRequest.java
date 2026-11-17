package com.plotchain.booking;

import com.plotchain.expense.PayMode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

// chargePct (35..100, % of the refunded excess) and payMode are required only when the new plot is worth
// less than the money already paid (the excess is refunded as a "Plot Transfer Refund" expense).
public record TransferPlotRequest(
    @NotNull UUID plotId,
    @DecimalMin("35") @DecimalMax("100") BigDecimal chargePct,
    PayMode payMode) {

    public TransferPlotRequest(UUID plotId) {
        this(plotId, null, null);
    }
}
