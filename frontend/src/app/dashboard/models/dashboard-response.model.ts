export interface AssociateSummary {
  associateId: string;
  name: string;
  rank: string;
  phone: string | null;
  joinedAt: string;
  rankChangedAt: string | null;
}

export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  sponsorMatchingIncome: number;
  selfPerformanceBonus: number;
  royaltyBonus: number;
  royaltyBonusPct: number;
  totalIncome: number;
  previousCycleTotalIncome: number;
  incomeTrend: number[];
}

export interface WalletSummary {
  balance: number;
}

export interface CycleCountdown {
  cycleId: string;
  daysRemaining: number;
}

export interface SalesSummary {
  salesThisCycle: number;
  revenueBookedThisCycle: number;
  revenueBookedChangePct: number;
}

export interface NetworkSummary {
  totalDownline: number;
  directCount: number;
}

export interface NetworkGrowthPoint {
  cycleLabel: string;
  downlineCount: number;
}

export interface KycBreakdown {
  verified: number;
  pending: number;
  rejected: number;
}

export interface DashboardResponse {
  associate: AssociateSummary;
  kycPendingBannerVisible: boolean;
  cycleIncome: CycleIncome;
  wallet: WalletSummary;
  cycleCountdown: CycleCountdown;
  salesSummary: SalesSummary;
  networkSummary: NetworkSummary;
  networkGrowth: NetworkGrowthPoint[];
  kycBreakdown: KycBreakdown;
}
