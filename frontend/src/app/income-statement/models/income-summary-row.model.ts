import { IncomeType } from './associate-ledger-entry.model';

// Mirrors backend income/AdminLedgerSummaryRow (GET /api/associates/me/income-summary):
// one row per cycle for the caller.
export interface IncomeSummaryRow {
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
