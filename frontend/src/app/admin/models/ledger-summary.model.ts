import { IncomeType } from './ledger-entry.model';

export interface AdminLedgerSummaryRow {
  associateId: string;
  associateUserId: string | null;
  associateName: string | null;
  cycleId: string;
  cyclePeriodStart: string | null;
  cyclePeriodEnd: string | null;
  gross: Partial<Record<IncomeType, number>>;
  totalGross: number;
  tds: number;
  adminCharges: number;
  totalNet: number;
  entryCount: number;
  paidCount: number;
  paidAt: string | null;
}

export interface AdminLedgerSummaryPage {
  rows: AdminLedgerSummaryRow[];
  page: number;
  size: number;
  totalElements: number;
}
