export type CycleStatus = 'OPEN' | 'CALCULATING' | 'CLOSED';

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
