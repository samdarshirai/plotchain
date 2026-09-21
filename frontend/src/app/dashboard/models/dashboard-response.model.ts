export interface AssociateSummary {
  associateId: string;
  name: string;
  rank: string;
  phone: string | null;
  joinedAt: string;
  rankChangedAt: string | null;
  // Both null when the associate has no sponsor (tree root) -- render a "Head Office" fallback.
  sponsorAssociateId: string | null;
  sponsorName: string | null;
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
  // Lifetime (all-cycle) sums, distinct from the this-cycle fields above.
  matchingIncomeLifetime: number;
  sponsorMatchingIncomeLifetime: number;
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
  leftAssociateCount: number;
  rightAssociateCount: number;
}

export interface LegVolumeSummary {
  leftLegVolume: number;
  rightLegVolume: number;
  // totalLeftBusiness/totalRightBusiness/totalSelfBusiness are lifetime; newBookedAreaSqft is
  // this-cycle only.
  totalLeftBusiness: number;
  totalRightBusiness: number;
  totalSelfBusiness: number;
  newBookedAreaSqft: number;
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
