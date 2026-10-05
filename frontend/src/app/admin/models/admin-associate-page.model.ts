import { AdminAssociateSummary } from './admin-associate-summary.model';

export interface AdminAssociatePage {
  associates: AdminAssociateSummary[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminAssociateFilters {
  search?: string;
  rank?: string;
  kycStatus?: string;
  excludeKycStatus?: string;
  status?: string;
  joinedFrom?: string;
  joinedTo?: string;
  newestFirst?: string;
}
