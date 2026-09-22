// Field names and nullability match backend/src/main/java/com/plotchain/associate/AssociateNomineeResponse.java
// and UpdateAssociateNomineeRequest.java exactly, same shape as associate-bank-details.model.ts.
export interface AssociateNomineeResponse {
  nomineeName: string | null;
  relation: string | null;
  updatedAt: string | null;
}

export interface UpdateAssociateNomineeRequest {
  nomineeName: string | null;
  relation: string | null;
  transactionPassword: string | null;
}
