import { AdminLedgerEntry, IncomeType, LedgerEntryStatus } from './ledger-entry.model';

export interface AdminLedgerPage {
  entries: AdminLedgerEntry[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminLedgerFilters {
  associateId?: string;
  incomeType?: IncomeType | '';
  cycleId?: string;
  status?: LedgerEntryStatus | '';
}
