export interface CreateRootAssociateRequest {
  name: string;
  phone: string;
  seedRightRoot: boolean;
  rightName?: string;
  rightPhone?: string;
}

export interface RootAssociateCreationResult {
  associateId: string;
  userId: string;
  temporaryPassword: string;
  name: string;
  slotLabel: 'LEFT' | 'RIGHT';
}

export interface CreateRootAssociateResponse {
  left: RootAssociateCreationResult;
  right: RootAssociateCreationResult | null;
}

export interface RootAssociateSummary {
  associateId: string;
  userId: string;
  name: string;
  phone: string;
  slotLabel: 'LEFT' | 'RIGHT';
}

export interface RootAssociateSlots {
  roots: RootAssociateSummary[];
  leftOccupied: boolean;
  rightOccupied: boolean;
}
