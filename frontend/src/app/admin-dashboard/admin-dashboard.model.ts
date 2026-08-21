// Field-for-field with the backend's AdminStatsResponse record (backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java).
// BigDecimal fields serialize as JSON numbers, same convention as dashboard-response.model.ts.
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
}
