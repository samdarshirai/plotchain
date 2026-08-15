package com.plotchain.wallet;

import com.plotchain.cycle.CycleStatus;

import java.math.BigDecimal;
import java.util.UUID;

public record WalletCreditingResult(UUID cycleId, int entriesCredited, BigDecimal totalAmountCredited, CycleStatus newCycleStatus) {
}
