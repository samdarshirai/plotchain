export type EPinStatus = 'UNUSED' | 'ALLOCATED' | 'USED' | 'BLOCKED';
export type RedemptionType = 'ACTIVATION' | 'TOPUP';

export interface EPin {
  id: string;
  code: string;
  batchId: string;
  status: EPinStatus;
  generatedBy: string;
  generatedAt: string;
  expiresAt: string | null;
  allocatedTo: string | null;
  allocatedBy: string | null;
  allocatedAt: string | null;
  redeemedTo: string | null;
  redeemedBy: string | null;
  redeemedAt: string | null;
  redemptionType: RedemptionType | null;
  linkedEntityId: string | null;
  blockedBy: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  expired: boolean;
}

export interface EPinPage {
  epins: EPin[];
  page: number;
  size: number;
  totalElements: number;
}

export interface EPinFilters {
  status?: EPinStatus | '';
  batchId?: string;
  allocatedTo?: string;
  redeemedTo?: string;
  expired?: boolean;
}

export interface EPinBatchResult {
  batchId: string;
  count: number;
  codes: string[];
  generatedAt: string;
  expiresAt: string | null;
}

export interface AllocateResult {
  associateId: string;
  count: number;
  pins: { id: string; code: string }[];
}

export interface EPinEvent {
  eventType: 'GENERATED' | 'ALLOCATED' | 'TRANSFERRED' | 'REDEEMED' | 'BLOCKED' | 'UNBLOCKED';
  actorId: string;
  fromAssociateId: string | null;
  toAssociateId: string | null;
  at: string;
  note: string | null;
}
