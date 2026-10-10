package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;

// JPQL constructor-expression target and response row of the associate EMI report; mode is paymentRef.
public record EmiReportRow(String associateId, String name, Instant paymentDate, BigDecimal amount, String mode) {}
