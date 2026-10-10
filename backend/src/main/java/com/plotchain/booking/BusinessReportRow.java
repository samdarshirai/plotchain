package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;

// One row of the associate "My Business Datewise" report; paymentDate is the booking's bookedAt.
public record BusinessReportRow(Instant paymentDate, Instant confirmDate, String associateId, String name,
                                String project, String plotNumber, BigDecimal business) {}
