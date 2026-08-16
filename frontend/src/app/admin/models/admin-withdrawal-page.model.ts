import { AdminWithdrawalRequest, WithdrawalRequestStatus } from './withdrawal-request.model';

// Mirrors backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalPageResponse.java --
// field named "requests" (not "entries"), per that file's own doc comment on unit 6.
export interface AdminWithdrawalPage {
  requests: AdminWithdrawalRequest[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminWithdrawalFilters {
  associateId?: string;
  status?: WithdrawalRequestStatus | '';
}
