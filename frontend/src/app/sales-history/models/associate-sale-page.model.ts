import { Sale } from '../../admin/models/sale.model';

export interface AssociateSalePage {
  sales: Sale[];
  page: number;
  size: number;
  totalElements: number;
}
