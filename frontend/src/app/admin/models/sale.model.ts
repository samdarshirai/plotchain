export type SaleStatus = 'RECORDED' | 'VOIDED';

export interface Sale {
  id: string;
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  amount: number;
  cycleId: string;
  legCredited: string;
  status: SaleStatus;
  voidReason: string | null;
  recordedAt: string;
}
