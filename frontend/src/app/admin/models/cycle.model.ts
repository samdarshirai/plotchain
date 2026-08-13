export type CycleStatus = 'OPEN' | 'CALCULATING' | 'CLOSED' | 'PAID';

export interface CycleSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
}

export interface CyclePage {
  cycles: CycleSummary[];
  page: number;
  size: number;
  totalElements: number;
}
