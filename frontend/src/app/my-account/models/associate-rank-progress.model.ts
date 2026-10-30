export interface AssociateRewardTier {
  tierLevel: number;
  volumeThreshold: number;
  cashReward: number;
  perkDescription: string;
  achieved: boolean;
}

export interface AssociateRankProgress {
  designation: string | null;
  nextDesignation: string | null;
  progressPercent: number;
  cumulativeMatchedVolume: number;
  volumeToNext: number;
  rewardTiers: AssociateRewardTier[];
}
