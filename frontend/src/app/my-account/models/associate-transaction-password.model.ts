// Field names match backend/src/main/java/com/plotchain/associate/TransactionPasswordStatusResponse.java
// and SetTransactionPasswordRequest.java exactly.
export interface TransactionPasswordStatusResponse {
  isSet: boolean;
}

// currentTransactionPassword is required only once isSet is true (bootstrapping otherwise) --
// same conditional-requirement shape as auth.service.ts's login-password changePassword.
export interface SetTransactionPasswordRequest {
  currentTransactionPassword: string | null;
  newTransactionPassword: string;
}
