// Field-for-field with the backend's AdminStatsResponse record (backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java).
// BigDecimal fields serialize as JSON numbers, same convention as dashboard-response.model.ts.
import { Sale } from '../admin/models/sale.model';

export interface KycBreakdown {
  pending: number;
  verified: number;
  rejected: number;
}

export interface CurrentCycleStats {
  cycleId: string;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  directIncome: number;
  matchingIncome: number;
  totalIncome: number;
  newAssociatesThisCycle: number;
  salesThisCycle: number;
  revenueThisCycle: number;
  previousCycleTotalIncome: number;
  incomeTrend: number[];
}

// Org-wide sibling of dashboard-response.model.ts's own NetworkGrowthPoint (which is scoped to
// one associate's downline) -- same field-name-mismatch-with-the-associate-version reasoning as
// KycBreakdown above, this one keyed on associateCount rather than downlineCount.
export interface NetworkGrowthPoint {
  cycleLabel: string;
  associateCount: number;
}

export interface AdminStatsResponse {
  totalAssociates: number;
  kycBreakdown: KycBreakdown;
  totalWalletBalance: number;
  pendingWithdrawals: number;
  currentCycle: CurrentCycleStats | null;
  activePlots: number;
  totalSalesRecorded: number;
  cyclesCompleted: number;
  networkGrowth: NetworkGrowthPoint[];
  recentSales: Sale[];
}
