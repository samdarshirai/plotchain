package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;

// One row of the admin plot-transfers list. Paid/rest are the snapshot taken at transfer time.
public record PlotTransferRow(Instant transferDate, String associateCode, String associateName,
                              String associatePhone, String projectName, String plotNo, String oldPlotNo,
                              BigDecimal paidAmount, BigDecimal restAmount) {}
