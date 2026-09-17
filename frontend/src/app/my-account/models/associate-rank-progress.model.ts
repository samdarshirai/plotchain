export interface AssociateRewardTier {
  tierLevel: number;
  volumeThreshold: number;
  cashReward: number;
  perkDescription: string;
  achieved: boolean;
}

export interface AssociateRankProgress {
  currentRank: string;
  currentRankOrder: number;
  nextRank: string | null;
  progressPercent: number;
  cumulativeMatchedVolume: number;
  volumeToNextRank: number;
  rewardTiers: AssociateRewardTier[];
}
