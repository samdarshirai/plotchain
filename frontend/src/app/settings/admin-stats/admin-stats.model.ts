// Field-for-field with the backend's AdminStatsResponse record. currentCycle is null when no
// OPEN cycle exists; BigDecimal fields serialize as JSON numbers (same convention as
// dashboard-response.model.ts).
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
}

export interface AdminStatsResponse {
  totalAssociates: number;
  kycBreakdown: KycBreakdown;
  totalWalletBalance: number;
  currentCycle: CurrentCycleStats | null;
}
