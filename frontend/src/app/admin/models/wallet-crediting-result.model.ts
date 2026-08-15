import { CycleStatus } from './cycle.model';

// Mirrors backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java -- field names
// confirmed against the real merged record (cycleId, entriesCredited, totalAmountCredited,
// newCycleStatus), no mismatch.
export interface WalletCreditingResult {
  cycleId: string;
  entriesCredited: number;
  totalAmountCredited: number;
  newCycleStatus: CycleStatus;
}
