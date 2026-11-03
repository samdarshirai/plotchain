package com.plotchain.income;

import java.math.BigDecimal;

// Per-leg business behind the Reward screen. paid = closed cycles, new = this open cycle,
// total = paid + new (same as the dashboard's Total Left/Right Business).
public record AssociateRewardBusiness(
    BigDecimal totalLeft,
    BigDecimal totalRight,
    BigDecimal paidLeft,
    BigDecimal paidRight,
    BigDecimal newLeft,
    BigDecimal newRight) {}
