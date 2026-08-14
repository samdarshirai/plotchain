// Matches backend/src/main/java/com/plotchain/associate/KycStatus.java (role-capability unit 8,
// merged) exactly -- a 3-value enum, no client-side "UNSUBMITTED" state: an associate who has
// never uploaded anything still reads PENDING (KycSubmissionService seeds it that way at
// provisioning time), just with an empty documents array.
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

// Matches KycDocumentSummary.java / AssociateKycStatusResponse.java exactly. No `id` field --
// the backend summary record doesn't expose one (document_type is the natural key per associate,
// enforced by the UNIQUE(associate_id, document_type) constraint on associate_kyc_document).
export interface KycDocumentSummary {
  documentType: string;
  contentType: string;
  uploadedAt: string;
}

export interface AssociateKycStatusResponse {
  kycStatus: KycStatus;
  documents: KycDocumentSummary[];
}

// Hardcoded, not fetched from the backend -- see this plan's Design decision 2. The
// admin-configured KycConfig.requiredDocuments list (backend/src/main/java/com/plotchain/payments/KycConfig.java)
// is only exposed via GET /api/company/kyc, which SecurityConfig.java gates ADMIN-only
// (backend/src/main/java/com/plotchain/auth/SecurityConfig.java:175-178) -- an Associate token
// 403s on it, and no associate-reachable equivalent exists. These three slugs are the same
// vocabulary KycSubmissionServiceTest's own test fixtures and KycSubmissionService's own header
// comment already establish as the expected document types (AADHAAR, PAN, BANK_PASSBOOK) --
// this is a real gap (an admin who reconfigures required documents in Settings has no way to
// change what an Associate is offered here), not a decision this screen-only unit can close.
export const KYC_DOCUMENT_TYPES: readonly string[] = ['AADHAAR', 'PAN', 'BANK_PASSBOOK'];
