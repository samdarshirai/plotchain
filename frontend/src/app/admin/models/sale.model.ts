export type SaleStatus = 'RECORDED' | 'VOIDED';

export interface Sale {
  id: string;
  plotId: string | null;
  associateId: string;
  buyerName: string;
  buyerPhone: string | null;
  buyerEmail: string | null;
  amount: number;
  cycleId: string;
  legCredited: string;
  status: SaleStatus;
  voidReason: string | null;
  recordedAt: string;
  plotNo: string | null;
  projectName: string | null;
  associateUserId: string | null;
  associateName: string | null;
  note: string;
}
