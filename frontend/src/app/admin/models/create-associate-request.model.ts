// Same profile as the associate e-Pin Join form (minus the transaction password, which the backend generates).
export interface CreateAssociateRequest {
  name: string;
  sponsorUserId?: string;
  position?: string;
  fatherHusbandName?: string;
  panNumber: string;
  aadhaarNumber: string;
  dateOfBirth?: string | null;
  gender?: string;
  maritalStatus?: string;
  email?: string | null;
  phone: string;
  state: string;
  district: string;
  address: string;
  postalCode?: string;
  nomineeName?: string;
  nomineeRelation?: string;
}
