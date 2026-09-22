// Field names and nullability match backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java
// and UpdateAssociateProfileRequest.java exactly (role-capability unit 11, merged; extended by
// the profile screen redesign's Personal Detail / Contact Detail sections). `id` is carried
// through for type completeness but never rendered -- userId is the user-facing identity field
// (see ProfileKycComponent's identity strip).
export interface AssociateProfileResponse {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  joinedAt: string;
  fatherHusbandName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  state: string | null;
  district: string | null;
  postalCode: string | null;
}

// A null phone/email/address/personal-detail field clears the field server-side (all nullable
// columns, not "required going forward" -- see UpdateAssociateProfileRequest.java's own header
// comment). name is @NotBlank server-side. transactionPassword is required only once the
// associate has ever set one (see TransactionPasswordVerifier) -- omit/null it otherwise.
export interface UpdateAssociateProfileRequest {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  fatherHusbandName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  state: string | null;
  district: string | null;
  postalCode: string | null;
  transactionPassword: string | null;
}
