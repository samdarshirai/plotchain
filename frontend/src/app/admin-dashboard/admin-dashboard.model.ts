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

// Admin Dashboard redesign 1a's Network Health card (2026-09-08-admin-dashboard-redesign-1a-design.md).
export interface NetworkHealth {
  activeThisCycle: number;
  joinedThisCycle: number;
  deepestLeg: number;
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
  // Redesign 1a additions. pendingWithdrawalsValue / oldestPendingWithdrawalAgeDays feed the
  // decision-queue Withdrawals row (count rides pendingWithdrawals, KYC rides kycBreakdown.pending);
  // plotsSold / plotsTotal feed the Inventory card grid (activePlots is the unsold count).
  pendingWithdrawalsValue: number;
  oldestPendingWithdrawalAgeDays: number | null;
  plotsSold: number;
  plotsTotal: number;
  networkHealth: NetworkHealth;
}
