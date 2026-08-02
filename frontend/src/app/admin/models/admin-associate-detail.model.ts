export interface AdminAssociateDetail {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  rankName: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  status: 'ACTIVE' | 'SUSPENDED';
  joinedAt: string;
  lastActiveAt: string | null;
  sponsorId: string | null;
  sponsorUserId: string | null;
  parentId: string | null;
  parentUserId: string | null;
  position: string | null;
  directDownlineCount: number;
  totalDownlineCount: number;
  leftLegVolume: number;
  rightLegVolume: number;
}
