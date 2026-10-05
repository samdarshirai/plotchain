export interface AssociateSummary {
  id: string;
  userId: string;
  name: string;
  role: 'ADMIN' | 'ASSOCIATE';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  hasFreeSlot: boolean;
}
