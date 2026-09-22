// Field names match backend/src/main/java/com/plotchain/associate/AssociateBankDetailsResponse.java
// and UpdateAssociateBankDetailsRequest.java exactly. All response fields are null until the
// associate saves bank details for the first time (no row yet) -- not an error state.
export interface AssociateBankDetailsResponse {
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  accountType: 'CURRENT' | 'SAVINGS' | null;
  updatedAt: string | null;
}

export interface UpdateAssociateBankDetailsRequest {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifscCode: string;
  accountType: 'CURRENT' | 'SAVINGS';
}
