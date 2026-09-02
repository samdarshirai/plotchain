export interface RoyaltyBonusRate {
  volumeThreshold: number;
  royaltyPct: number;
}

export interface RewardTier {
  tierLevel: number;
  volumeThreshold: number;
  cashReward: number;
  perkDescription: string;
}

export interface RankOption {
  id: string;
  name: string;
}

export interface CompensationPlanResponse {
  versionLabel: string;
  effectiveFrom: string;
  directIncomePct: number;
  matchingIncomePct: number;
  sponsorMatchingPct: number;
  tdsPct: number;
  adminChargeWithPanPct: number;
  adminChargeWithoutPanPct: number;
  activationFee: number;
  minWithdrawal: number;
  settlementCycle: 'SEMI_MONTHLY' | 'MONTHLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
  royaltyBonusRates: RoyaltyBonusRate[];
  rewardTiers: RewardTier[];
  availableRanks: RankOption[];
  createdAt: string | null;
}

export type SettlementCycle = CompensationPlanResponse['settlementCycle'];

export type CompensationPlanRequest = Omit<
  CompensationPlanResponse,
  'versionLabel' | 'createdAt' | 'availableRanks' | 'effectiveFrom'
> & {
  // Optional, matching the backend contract: CompensationPlanService defaults it to today when
  // absent. This step has no future-dating UI, so it is never sent.
  effectiveFrom?: string;
};

export interface CompensationPlanSummary {
  versionLabel: string;
  effectiveFrom: string;
  createdAt: string;
}
