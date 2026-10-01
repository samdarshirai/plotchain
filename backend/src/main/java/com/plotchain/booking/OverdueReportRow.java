package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// JPQL constructor-expression target and response row of the admin overdue-EMI report (unit 9).
public record OverdueReportRow(UUID bookingId, UUID plotId, String plotNo, UUID associateId, String associateName,
                               String buyerName, long overdueCount, BigDecimal overdueAmount, LocalDate oldestDueDate) {}
