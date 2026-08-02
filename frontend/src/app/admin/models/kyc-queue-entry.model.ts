export interface KycQueueEntry {
  id: string;
  userId: string;
  name: string;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  joinedAt: string;
}
