// Field names mirror the merged backend/src/main/java/com/plotchain/withdrawal/
// AdminWithdrawalResponse.java and WithdrawalRequestStatus.java (wallet/withdrawal units 5/6,
// Decision 14) -- verified field-for-field against the real merged files before this was
// written. reason/bankReference/decidedAt/disbursedAt are all nullable: a fresh REQUESTED row
// has no reason/bankReference/decidedAt/disbursedAt yet; an APPROVED row has decidedAt but not
// bankReference/disbursedAt; only a DISBURSED row has all fields populated.
export type WithdrawalRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DISBURSED';

export interface AdminWithdrawalRequest {
  id: string;
  associateId: string;
  associateUserId: string;
  associateName: string;
  amount: number;
  status: WithdrawalRequestStatus;
  reason: string | null;
  bankReference: string | null;
  requestedAt: string;
  decidedAt: string | null;
  disbursedAt: string | null;
}
