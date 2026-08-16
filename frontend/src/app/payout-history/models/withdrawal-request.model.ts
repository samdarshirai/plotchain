// frontend/src/app/payout-history/models/withdrawal-request.model.ts
// Mirrors backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestStatus.java and
// AssociateWithdrawalResponse.java (wallet/withdrawal unit 9). Deliberately no
// associateId/associateUserId/associateName fields -- every row returned by
// GET /api/associates/me/withdrawals is always the caller's own (Decision 14), so the backend
// response never carries them and this model doesn't invent them.
export type WithdrawalRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DISBURSED';

export interface AssociateWithdrawalRequest {
  id: string;
  amount: number;
  status: WithdrawalRequestStatus;
  reason: string | null;
  bankReference: string | null;
  requestedAt: string;
  decidedAt: string | null;
  disbursedAt: string | null;
}
