export interface AdminAssociateSummary {
  id: string;
  userId: string;
  name: string;
  designation: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  joinedAt: string;
  sponsorUserId: string | null;
  position: 'L' | 'R' | null;
  lastActiveAt: string | null;
  role: 'ADMIN' | 'MANAGER' | 'ASSOCIATE';
  loginPassword: string | null;
  transactionPassword: string | null;
  phone: string | null;
  email: string | null;
  activatedAt: string | null;
  plotBuyer: boolean;
}
