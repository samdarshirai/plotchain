// frontend/src/app/payout-history/models/associate-withdrawal-page.model.ts
// Mirrors backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalPageResponse.java --
// field named "requests" to match the real merged backend record field name verbatim (not
// "withdrawals" or "entries").
import { AssociateWithdrawalRequest, WithdrawalRequestStatus } from './withdrawal-request.model';

export interface AssociateWithdrawalPage {
  requests: AssociateWithdrawalRequest[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AssociateWithdrawalFilters {
  status?: WithdrawalRequestStatus;
}
