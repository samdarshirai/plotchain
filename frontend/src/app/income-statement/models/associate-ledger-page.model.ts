import { AssociateLedgerEntry, IncomeType, LedgerEntryStatus } from './associate-ledger-entry.model';

export interface AssociateLedgerPage {
  entries: AssociateLedgerEntry[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AssociateLedgerFilters {
  incomeType?: IncomeType;
  cycleId?: string;
  status?: LedgerEntryStatus;
}
