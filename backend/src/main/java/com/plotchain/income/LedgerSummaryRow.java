package com.plotchain.income;

import java.math.BigDecimal;
import java.util.UUID;

// Projection for LedgerEntryRepository#summarise: one row per associate x cycle.
public interface LedgerSummaryRow {
        UUID getAssociateId();
        UUID getCycleId();
        BigDecimal getDirect();
        BigDecimal getMatching();
        BigDecimal getSponsorMatching();
        BigDecimal getRoyalty();
        BigDecimal getReward();
        BigDecimal getSelfPerformance();
        BigDecimal getTotalGross();
        BigDecimal getTds();
        BigDecimal getAdminCharges();
        BigDecimal getTotalNet();
        long getEntryCount();
        long getPaidCount();
}
