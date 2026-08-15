import { CycleStatus } from './cycle.model';

// Mirrors backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java. Field names
// verified (or, if unit 1 was not yet merged when this file was written, provisionally assumed)
// against docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md unit 1's acceptance
// criteria: "Returns WalletCreditingResult(cycleId, entriesCredited, totalAmountCredited,
// newCycleStatus)". Re-verify against the real merged file before relying on this in production
// if it was written before unit 1 merged -- see this plan's Global Constraints.
export interface WalletCreditingResult {
  cycleId: string;
  entriesCredited: number;
  totalAmountCredited: number;
  newCycleStatus: CycleStatus;
}
