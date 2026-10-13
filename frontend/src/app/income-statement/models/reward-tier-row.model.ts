import { LedgerEntryStatus } from './associate-ledger-entry.model';

export interface RewardTierRow {
  tierLevel: number;
  matchingBusiness: number;
  designation: string | null;
  requiredLeftBusiness: number;
  requiredRightBusiness: number;
  reward: number;
  perkDescription: string | null;
  status: LedgerEntryStatus | null;
  achievedDate: string | null;
}
