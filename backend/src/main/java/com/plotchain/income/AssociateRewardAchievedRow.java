package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;

// One achieved reward. Paid = admin recorded fulfilment (fulfilledAt set), not wallet credit.
public record AssociateRewardAchievedRow(
    Instant achievedDate,
    String designation,
    BigDecimal reward,
    String perkDescription,
    boolean paid,
    Instant paymentDate,
    String remarks) {}
