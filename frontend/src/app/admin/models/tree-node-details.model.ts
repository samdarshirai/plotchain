export interface TreeNodeDetails {
  name: string;
  userId: string;
  joinedAt: string;
  leftMemberId: string | null;
  rightMemberId: string | null;
  totalLeftMembers: number;
  totalRightMembers: number;
  activeLeftMembers: number;
  activeRightMembers: number;
  totalLeftBusiness: number;
  totalRightBusiness: number;
  totalSelfBusiness: number;
}
