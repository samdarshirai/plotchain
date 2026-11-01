import { IncomeType } from './associate-ledger-entry.model';

// Mirrors backend income/AdminLedgerSummaryRow (GET /api/associates/me/income-summary):
// one row per cycle for the caller. Also GET /api/associates/me/downline-income: one row per
// downline associate x cycle (associateUserId/associateName set).
export interface IncomeSummaryRow {
  associateUserId?: string | null;
  associateName?: string | null;
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
