import { CycleStatus } from './cycle.model';

export type CycleIncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD';

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
}
