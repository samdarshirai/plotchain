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
  plotType?: string | null;
  areaSqft?: number | null;
  rate?: number | null;
  listPrice?: number | null;
  extraPrice?: number | null;
  buyerAssociateUserId?: string | null;
  buyerPlacementUserId?: string | null;
  // associateUserId/Name above is the buyer; the sponsor earns Direct Income and the volume.
  sponsorUserId?: string | null;
  sponsorName?: string | null;
}
