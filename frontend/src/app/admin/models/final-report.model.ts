import { CycleStatus } from './cycle.model';
import { CycleIncomeTypeTotal } from './cycle-detail.model';

export interface NamedAmount {
  name: string;
  amount: number;
}

export interface FinalReport {
  cycleId: string;
  periodStart: string;
  periodEnd: string | null;
  status: CycleStatus;
  totalBusiness: number;
  grossCommission: number;
  incomeTypeTotals: CycleIncomeTypeTotal[];
  expenses: NamedAmount[];
  totalExpenses: number;
  totalPayout: number;
  payoutPercent: number;
  refunds: NamedAmount[];
  totalRefunds: number;
}

export interface FinalReportCycleOption {
  cycleId: string;
  periodStart: string;
  periodEnd: string | null;
  status: CycleStatus;
}

export interface FinalReportTable {
  allCycles: FinalReportCycleOption[];
  expenseTypes: string[];
  refundTypes: string[];
  rows: FinalReport[];
  total: FinalReport;
}
