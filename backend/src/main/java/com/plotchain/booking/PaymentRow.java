package com.plotchain.booking;

import com.plotchain.projects.PlotType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// One row of the admin payments list (U3). entryBy/confirmBy/paymentMode/paymentRef may be null (token and legacy rows).
public record PaymentRow(UUID bookingId, int installmentNumber, Instant paymentDate, String associateCode,
                         String associateName, String projectName, String plotNo, BigDecimal amount,
                         PaymentMode paymentMode, String paymentRef, String entryBy, String confirmBy,
                         Instant confirmedAt, Instant bookedAt, String associatePhone, PlotType plotType,
                         BigDecimal areaSqft, BigDecimal rate, BigDecimal extraPrice, BigDecimal discount,
                         BigDecimal totalAmount, BigDecimal paidAmount, BigDecimal dueAmount) {}
