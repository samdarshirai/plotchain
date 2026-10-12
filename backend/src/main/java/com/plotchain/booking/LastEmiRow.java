package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// paid = PAID installments only (ENTERED is received-but-unconfirmed); rest = total - paid.
public record LastEmiRow(UUID bookingId, Instant bookedAt, String associateCode, String associateName,
                         String buyerName, String buyerPhone, String plotNo, String projectName,
                         LocalDate lastDueDate, BigDecimal discount, BigDecimal total, BigDecimal paid,
                         BigDecimal rest) {}
