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
  cycleNumber: number;
  periodStart: string;
  periodEnd: string;
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

export interface LegVolumeSummary {
  leftLegVolume: number;
  rightLegVolume: number;
}

export interface DashboardResponse {
  associate: AssociateSummary;
  kycPendingBannerVisible: boolean;
  cycleIncome: CycleIncome;
  wallet: WalletSummary;
  cycleCountdown: CycleCountdown;
  salesSummary: SalesSummary;
  networkSummary: NetworkSummary;
  legVolumeSummary: LegVolumeSummary;
}
