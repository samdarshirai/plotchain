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
