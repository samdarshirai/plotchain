import { CycleStatus } from './cycle.model';

export type CycleIncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD' | 'SELF_PERFORMANCE';

export interface CycleIncomeTypeTotal {
  incomeType: CycleIncomeType;
  totalNet: number;
}

export interface CycleDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
  incomeTypeTotals: CycleIncomeTypeTotal[];
  totalNet: number;
  totalBusiness: number;
  totalGross: number;
  tripExpense: number;
}
