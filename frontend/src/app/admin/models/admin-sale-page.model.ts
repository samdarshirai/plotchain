import { Sale, SaleStatus } from './sale.model';

export interface AdminSalePage {
  sales: Sale[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminSaleFilters {
  search?: string;
  status?: SaleStatus | '';
  recordedFrom?: string;
  recordedTo?: string;
  cycleId?: string;
  plotNo?: string;
}
