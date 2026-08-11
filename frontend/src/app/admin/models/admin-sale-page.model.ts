import { Sale, SaleStatus } from './sale.model';

export interface AdminSalePage {
  sales: Sale[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminSaleFilters {
  associateId?: string;
  status?: SaleStatus | '';
  recordedFrom?: string;
  recordedTo?: string;
}
