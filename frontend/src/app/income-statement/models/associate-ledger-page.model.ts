import { AssociateLedgerEntry, IncomeType, LedgerEntryStatus } from './associate-ledger-entry.model';

export interface AssociateLedgerPage {
  entries: AssociateLedgerEntry[];
  page: number;
  size: number;
  totalElements: number;
  // Sum of gross amounts over the whole filtered set (not just this page).
  totalGrossAmount: number;
}

export interface AssociateLedgerFilters {
  incomeType?: IncomeType;
  cycleId?: string;
  status?: LedgerEntryStatus;
}
