// Field names and nullability match backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java
// and UpdateAssociateProfileRequest.java exactly (role-capability unit 11, merged). `id` is
// carried through for type completeness but never rendered -- userId is the user-facing identity
// field (see ProfileKycComponent's identity strip).
export interface AssociateProfileResponse {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  joinedAt: string;
}

// A null phone/email clears the field server-side (both are nullable columns, not "required
// going forward" -- see UpdateAssociateProfileRequest.java's own header comment). name is
// @NotBlank server-side.
export interface UpdateAssociateProfileRequest {
  name: string;
  phone: string | null;
  email: string | null;
}
