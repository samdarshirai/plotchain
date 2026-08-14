// Field names below mirror the actual merged
// backend/src/main/java/com/plotchain/income/AssociateLedgerEntryResponse.java (Income/Ledger
// unit 2) -- verified against the real file before this model was written (per Income/Ledger
// unit 4's plan, Global Constraints). UUID/LocalDate/Instant/BigDecimal all serialize to JSON
// strings/numbers, so the field names line up 1:1 with no renames needed.
export type IncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD' | 'PERK';

export type LedgerEntryStatus = 'PENDING' | 'CARRIED_FORWARD' | 'PAID' | 'REVERSED';

export interface AssociateLedgerEntry {
  id: string;
  incomeType: IncomeType;
  cycleId: string;
  cyclePeriodStart: string | null;
  cyclePeriodEnd: string | null;
  grossAmount: number;
  tdsDeduction: number;
  adminDeduction: number;
  netAmount: number;
  status: LedgerEntryStatus;
  sourceRef: string | null;
  createdAt: string;
}
