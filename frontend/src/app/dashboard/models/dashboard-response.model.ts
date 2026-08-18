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
}

export interface WalletSummary {
  balance: number;
}

export interface LegVolumeSummary {
  leftVolume: number;
  rightVolume: number;
  carriedForwardLeft: number;
  carriedForwardRight: number;
  projectedMatchAmount: number;
  totalLeftBusiness: number;
  totalRightBusiness: number;
  newBookedAreaSqft: number;
}

export interface RankProgress {
  currentRank: string;
  currentRankOrder: number;
  nextRank: string | null;
  progressPercent: number;
  volumeToNextRank: number;
}

export interface TeamSnapshot {
  totalDownline: number;
  activeToday: number;
  newJoinsThisCycle: number;
}

export interface CycleCountdown {
  cycleId: string;
  daysRemaining: number;
}

export interface AnnouncementSummary {
  id: string;
  title: string;
  publishedAt: string;
}

export interface DashboardResponse {
  associate: AssociateSummary;
  kycPendingBannerVisible: boolean;
  cycleIncome: CycleIncome;
  wallet: WalletSummary;
  legVolume: LegVolumeSummary;
  rankProgress: RankProgress;
  teamSnapshot: TeamSnapshot;
  cycleCountdown: CycleCountdown;
  announcements: AnnouncementSummary[];
}
