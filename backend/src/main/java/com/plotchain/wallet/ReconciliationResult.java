package com.plotchain.wallet;

import java.math.BigDecimal;
import java.util.UUID;

public record ReconciliationResult(UUID associateId, int entriesCredited, BigDecimal totalAmountCredited) {
}
