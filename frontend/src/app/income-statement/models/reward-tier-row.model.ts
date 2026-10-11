import { LedgerEntryStatus } from './associate-ledger-entry.model';

export interface RewardTierRow {
  tierLevel: number;
  matchingBusiness: number;
  requiredLeftBusiness: number;
  requiredRightBusiness: number;
  reward: number;
  status: LedgerEntryStatus | null;
  achievedDate: string | null;
}
