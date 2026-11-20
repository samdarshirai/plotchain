export interface AssociateSummary {
  id: string;
  userId: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'ASSOCIATE';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  hasFreeSlot: boolean;
  hasEpin: boolean;
  freeLegs?: string[];
  sponsorId?: string | null;
  sponsorUserId?: string | null;
  sponsorName?: string | null;
  phone?: string | null;
}
