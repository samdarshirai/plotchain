export interface CompanyProfileResponse {
  displayName: string;
  legalName: string;
  registrationNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  registeredAddress: string;
  updatedAt: string | null;
}

export type CompanyProfileRequest = Omit<CompanyProfileResponse, 'updatedAt'>;

// Matches backend/src/main/java/com/plotchain/company/CompanyLetterheadResponse.java -- the
// associate-reachable subset of CompanyProfileResponse (GET /api/company/profile stays admin-only).
export interface CompanyLetterheadResponse {
  displayName: string;
  registeredAddress: string;
  contactPhone: string;
  contactEmail: string;
}
