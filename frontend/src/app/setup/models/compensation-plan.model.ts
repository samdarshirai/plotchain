export interface RoyaltyBonusRate {
  rankId: string;
  rankName: string;
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
  settlementCycle: 'SEMI_MONTHLY' | 'MONTHLY' | 'CUSTOM';
  royaltyBonusRates: RoyaltyBonusRate[];
  rewardTiers: RewardTier[];
  availableRanks: RankOption[];
  createdAt: string | null;
}

export type CompensationPlanRequest = Omit<
  CompensationPlanResponse,
  'versionLabel' | 'createdAt' | 'availableRanks' | 'royaltyBonusRates'
> & {
  royaltyBonusRates: Omit<RoyaltyBonusRate, 'rankName'>[];
};

export interface CompensationPlanSummary {
  versionLabel: string;
  effectiveFrom: string;
  createdAt: string;
}
