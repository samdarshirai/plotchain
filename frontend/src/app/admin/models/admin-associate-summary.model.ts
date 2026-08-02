export interface AdminAssociateSummary {
  id: string;
  userId: string;
  name: string;
  rankName: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  status: 'ACTIVE' | 'SUSPENDED';
  joinedAt: string;
  lastActiveAt: string | null;
}
