// Field names below mirror the merged backend/src/main/java/com/plotchain/income/
// AdminLedgerEntryResponse.java (income-ledger unit 1, commits 1952762..35ada23) --
// verified field-for-field against the real merged file before this file was written.
export type IncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD' | 'PERK';

export type LedgerEntryStatus = 'PENDING' | 'CARRIED_FORWARD' | 'PAID' | 'REVERSED';

export interface AdminLedgerEntry {
  id: string;
  associateId: string;
  associateUserId: string;
  associateName: string;
  incomeType: IncomeType;
  cycleId: string;
  cyclePeriodStart: string;
  cyclePeriodEnd: string;
  grossAmount: number;
  tdsDeduction: number;
  adminDeduction: number;
  netAmount: number;
  status: LedgerEntryStatus;
  sourceRef: string | null;
  createdAt: string;
}
